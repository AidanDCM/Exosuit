/**
 * HYP-001 live Field lifecycle harness (M1).
 *
 *   preflight  — HYP-001.1–.6, read-only host checks; writes a preflight artifact
 *   cycles     — HYP-001.7–.16, three create/boot/ready/stop/destroy cycles
 *   record     — records the produced artifacts as evidence via the CLI
 *
 * Three commands rather than one, for two reasons. Recording is a *claim* and
 * evaluation is the judgment (see `record` in cli.ts), so a run that fails
 * halfway must not leave a claim behind; and `cycles` mutates the host while
 * `preflight` and `record` do not, which keeps the destructive surface in one
 * place that can be reviewed on its own.
 *
 * Every ledger and evidence write goes through `src/completion/cli.ts` rather
 * than re-implementing signing here. Three times already a check was tightened
 * and a verification tool left behind on the old surface, each time producing a
 * misleading green result; a harness that owns its own copy of the crypto is
 * exactly how that happens a fourth time.
 *
 * Usage:
 *   export EXOSUIT_COMPLETION_KEY_DIR="C:/Users/Aidan/.exosuit-live-keys"
 *   export EXOSUIT_COMPLETION_KEY_PREFIX="live-"
 *   tsx src/completion/hyp001Harness.ts preflight
 *   tsx src/completion/hyp001Harness.ts cycles --apply --confirm "RUN HYP-001 LIVE CYCLES"
 *   tsx src/completion/hyp001Harness.ts record
 *
 * `cycles` must run elevated, from an account in Hyper-V Administrators. It
 * provisions and destroys real VMs. Without `--apply` it plans and prints and
 * touches nothing.
 */

import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { hostname } from "node:os";
import {
  fieldLifecycleLedgerSchema,
  type BuildCompletionManifest,
  type FieldLifecycleLedger,
} from "./contracts.js";
import { createFieldProvisioningPlan } from "../fieldProvisioningPlan.js";
import { tpmStatus } from "./tpmSeal.js";
import {
  deriveBootId,
  hyp001RunSchema,
  resolveDotnetSdk,
  validateHyp001Run,
  REQUIRED_CYCLES,
  type Hyp001Cycle,
} from "./hyp001.js";

const ROOT = resolve(process.cwd());
const DIR = resolve(process.env["EXOSUIT_COMPLETION_DIR"] ?? join(ROOT, "docs", "qa", "completion"));
const OUT = resolve(process.env["EXOSUIT_HYP001_DIR"] ?? join(ROOT, "artifacts", "hyp001"));
const SCRIPTS = join(ROOT, "scripts", "windows");
const HOST_CONFIG = resolve(process.env["EXOSUIT_FIELD_HOST_CONFIG"] ?? join(ROOT, "vm", "field-host-config.local.json"));

/**
 * Host RAM is 15.44 GB with roughly 3.7 GB genuinely free, and the plan
 * builder's defaults (8 GiB startup, 12 GiB max) will not start a Field here.
 * Dynamic memory with a small floor is what actually boots on this machine.
 */
const MEMORY = { minimumMemoryMiB: 1_024, startupMemoryMiB: 2_048, maximumMemoryMiB: 4_096 } as const;

const CONFIRMATION = "RUN HYP-001 LIVE CYCLES";

/* ------------------------------------------------------------------ util */

function arg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function requireArg(flag: string): string {
  const value = arg(flag);
  if (value === undefined) throw new Error(`Missing required argument ${flag}.`);
  return value;
}

function powershell(script: string): string {
  return execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    // Captured rather than inherited: probes below are allowed to fail, and a
    // failed probe's stderr in the operator's console reads like a harness
    // crash when it is a recorded preflight result.
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function powershellScript(file: string, args: readonly string[]): string {
  return execFileSync(
    "powershell",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", join(SCRIPTS, file), ...args],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  ).trim();
}

/** Reads JSON tolerating a UTF-8 BOM; PowerShell 5.1 writes one and JSON.parse rejects it. */
function readJsonFile<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, "")) as T;
}

function writeJsonFile(path: string, value: unknown): void {
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function machineIdentity(): string {
  return `machine-${createHash("sha256").update(hostname()).digest("hex").slice(0, 16)}`;
}

/** Drives the completion CLI. Inherits stdio so operator-visible output is not swallowed. */
function completionCli(args: readonly string[]): void {
  execFileSync("npx", ["tsx", join(ROOT, "src", "completion", "cli.ts"), ...args], {
    stdio: "inherit",
    cwd: ROOT,
    shell: process.platform === "win32",
  });
}

function readLifecycle(): FieldLifecycleLedger {
  const path = join(DIR, "field-lifecycle.json");
  return existsSync(path)
    ? fieldLifecycleLedgerSchema.parse(readJsonFile(path))
    : { contractVersion: 2, events: [] };
}

/**
 * The recorded time of the last lifecycle event of a given kind for a
 * generation. The CLI clamps `recordedAt` forward to keep the ledger
 * monotonic, so the value it actually wrote — not the harness's own clock —
 * is what defines the boot window.
 */
function lastLifecycleTime(fieldId: string, generation: number, kind: string): string {
  const events = readLifecycle().events
    .filter((event) => event.fieldId === fieldId && event.generation === generation && event.kind === kind)
    .sort((a, b) => a.sequence - b.sequence);
  const last = events.at(-1);
  if (last === undefined) throw new Error(`No ${kind} lifecycle event for ${fieldId} generation ${generation}.`);
  return last.recordedAt;
}

/* -------------------------------------------------------------- preflight */

interface PreflightResult {
  readonly ok: boolean;
  readonly checks: Record<string, unknown>;
}

/**
 * HYP-001.1–.6. Read-only by construction: every call here is a Get-* or an
 * equivalent inspection. A failing preflight stops the run before anything is
 * provisioned, which is the documented failure action for each of these.
 */
function runPreflight(): PreflightResult {
  const hostReport = JSON.parse(powershellScript("Test-ExosuitFieldHost.ps1", [])) as Record<string, unknown>;
  const config = readJsonFile<{
    baseImages: readonly { imageId: string; path: string; digest: string }[];
    networkSwitches: { isolated: string };
  }>(HOST_CONFIG);

  const baseImageId = arg("--base-image") ?? config.baseImages.at(-1)?.imageId;
  const base = config.baseImages.find((image) => image.imageId === baseImageId);
  if (base === undefined) throw new Error(`Base image ${String(baseImageId)} is not in ${HOST_CONFIG}.`);

  // HYP-001.5 — the exact approved image, by content, not by name.
  const baseDigest = existsSync(base.path) ? sha256File(base.path) : undefined;

  // HYP-001.4 — the toolchain the guest bootstrap and the harness both need.
  const sdk = resolveDotnetSdk();
  const toolchain = {
    node: process.version,
    powershell: powershell("$PSVersionTable.PSVersion.ToString()"),
    dotnet: sdk === undefined ? "unavailable" : sdk.version,
    dotnetPath: sdk?.path ?? "unresolved",
  };

  const isolatedSwitch = powershell(
    `$s = Get-VMSwitch -Name '${config.networkSwitches.isolated.replace(/'/g, "''")}' -ErrorAction SilentlyContinue; `
    + "if ($null -eq $s) { 'missing' } else { $s.SwitchType.ToString() }",
  );

  const elevated = powershell(
    "([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent())"
    + ".IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)",
  ) === "True";

  // Handoff §7.1 and §7.2. Both weaken every live attestation M1 produces, and
  // both stop being fixable-for-free once trials are underway — evidence
  // gathered under an unverified boot chain does not retroactively improve when
  // the chain is fixed. So they are preconditions the harness checks, not notes
  // someone is meant to remember.
  const secureBoot = (() => {
    try {
      return powershell("Confirm-SecureBootUEFI") === "True" ? "enabled" : "disabled";
    } catch {
      // Unreadable is not the same as off, and must not be scored as either.
      return "unreadable";
    }
  })();
  const tpm = tpmStatus();
  const sealedKeys = (() => {
    const dir = process.env["EXOSUIT_COMPLETION_KEY_DIR"];
    if (dir === undefined || !existsSync(dir)) return { dpapi: 0, tpm: 0 };
    const names = readdirSync(dir);
    return {
      dpapi: names.filter((name) => name.endsWith(".pem.dpapi")).length,
      tpm: names.filter((name) => name.endsWith(".pem.tpm")).length,
    };
  })();

  const checks: Record<string, unknown> = {
    host: hostReport,
    toolchain,
    baseImage: { imageId: base.imageId, path: base.path, expectedDigest: base.digest, observedDigest: baseDigest },
    isolatedSwitch: { name: config.networkSwitches.isolated, type: isolatedSwitch },
    elevated,
    machineId: machineIdentity(),
    trustPosture: { secureBoot, tpm, sealedKeys },
  };

  const failures: string[] = [];
  if (baseDigest === undefined) failures.push(`base image missing at ${base.path}`);
  else if (baseDigest !== base.digest.toLowerCase()) failures.push("base image digest does not match the host configuration");
  if (isolatedSwitch !== "Private") failures.push(`isolated switch is '${isolatedSwitch}', expected Private`);
  if (!elevated) failures.push("not elevated; Hyper-V provisioning requires an elevated token");
  if (toolchain.dotnet === "unavailable") {
    failures.push("no .NET SDK on PATH or in %USERPROFILE%\\.dotnet; HYP-001.4 requires it");
  }
  if (secureBoot === "disabled") {
    failures.push(
      "host Secure Boot is disabled; the boot chain under the root key is unverified (§7.1). "
      + "Enable it in UEFI firmware before collecting M1 evidence.",
    );
  } else if (secureBoot !== "enabled") {
    // Unreadable is not evidence of either state, so it cannot be scored as a
    // pass — but the remedy is to re-run elevated, not to change firmware.
    failures.push(
      "host Secure Boot state is unreadable; Confirm-SecureBootUEFI needs elevation. "
      + "Re-run preflight elevated before trusting either answer.",
    );
  }
  if (sealedKeys.dpapi > 0 && sealedKeys.tpm < sealedKeys.dpapi) {
    failures.push(
      `${sealedKeys.tpm}/${sealedKeys.dpapi} live keys are TPM-sealed; the host key still rests on DPAPI alone (§7.2). `
      + "Run scripts/completion/seal-live-keys-to-tpm.mjs --apply.",
    );
  }
  if (!tpm.available) failures.push(`TPM platform provider unavailable: ${tpm.reason ?? "unknown"}`);

  return { ok: failures.length === 0, checks: { ...checks, failures } };
}

function commandPreflight(): void {
  const result = runPreflight();
  const path = join(OUT, "preflight.json");
  writeJsonFile(path, { contractVersion: 1, testId: "HYP-001", stage: "preflight", ...result });
  console.log(`Preflight ${result.ok ? "passed" : "FAILED"} — ${path}`);
  if (!result.ok) {
    console.error(JSON.stringify((result.checks as { failures: string[] }).failures, null, 2));
    process.exitCode = 1;
  }
}

/* ----------------------------------------------------------------- cycles */

type CycleRecord = Hyp001Cycle;

/**
 * The instant the host saw this VM come up. Hyper-V reports uptime rather than
 * a power-on timestamp, so the absolute instant is derived from it and read
 * once, immediately after start, while the two are still close together.
 */
function vmPowerOnTime(vmName: string): string {
  const uptimeSeconds = Number.parseFloat(
    powershell(`(Get-VM -Name '${vmName.replace(/'/g, "''")}').Uptime.TotalSeconds`),
  );
  if (!Number.isFinite(uptimeSeconds)) throw new Error(`Could not read uptime for ${vmName}.`);
  return new Date(Date.now() - uptimeSeconds * 1000).toISOString();
}

function vmGuid(vmName: string): string {
  return powershell(`(Get-VM -Name '${vmName.replace(/'/g, "''")}').Id.Guid`);
}

/**
 * HYP-001.8 — cold boot readiness. Waits for the guest to reach a
 * host-observable ready state. Heartbeat is what the host can see without
 * guest credentials; full guest authentication is CHN-001's proof domain, not
 * this gate's, and conflating the two would let HYP-001 claim something it has
 * not shown.
 */
function waitForReady(vmName: string, timeoutSeconds: number): number {
  const escaped = vmName.replace(/'/g, "''");
  const startedMs = Date.now();
  const deadline = startedMs + timeoutSeconds * 1000;
  for (;;) {
    const state = powershell(
      `$h = Get-VMIntegrationService -VMName '${escaped}' -Name Heartbeat -ErrorAction SilentlyContinue; `
      + "if ($null -eq $h) { 'none' } else { $h.PrimaryStatusDescription }",
    );
    if (state === "OK") return Math.round((Date.now() - startedMs) / 1000);
    if (Date.now() > deadline) {
      throw new Error(`${vmName} did not reach heartbeat OK within ${timeoutSeconds}s (last: ${state}).`);
    }
    execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", "Start-Sleep -Seconds 5"]);
  }
}

function buildPlan(fieldId: string, generation: number, baseImageId: string, baseDigest: string): string {
  const plan = createFieldProvisioningPlan({
    identity: {
      subsystem: "field",
      fieldId,
      fieldGeneration: generation,
      agentId: "hyp001-harness",
      machineId: machineIdentity(),
      windowsSessionId: "hyp001",
      baseImageDigest: baseDigest,
      taskDiskId: `${fieldId}-g${generation}-task`,
      createdAt: new Date().toISOString(),
    } as never,
    display: {
      monitorCount: 1,
      width: 1920,
      height: 1080,
      scalePercent: 100,
      browserZoomPercent: 100,
      keyboardLayout: "en-US",
      dynamicResolutionAllowed: false,
    },
    baseImageId,
    networkMode: "isolated",
    ...MEMORY,
  });
  const path = join(OUT, `plan-g${generation}.json`);
  writeJsonFile(path, plan);
  return path;
}

function runOneCycle(input: {
  readonly cycle: number;
  readonly fieldId: string;
  readonly generation: number;
  readonly baseImageId: string;
  readonly baseDigest: string;
  readonly readyTimeoutSeconds: number;
}): CycleRecord {
  const { cycle, fieldId, generation, baseImageId, baseDigest } = input;
  const vmName = `Exosuit-Field-${fieldId}-G${generation}`;
  const baseDigestBefore = baseDigest;

  console.log(`\n--- cycle ${cycle}/${REQUIRED_CYCLES}: ${fieldId} generation ${generation}`);

  // HYP-001.7 clean provision, from the immutable base onto a disposable overlay.
  const planPath = buildPlan(fieldId, generation, baseImageId, baseDigest);
  powershellScript("Invoke-ExosuitFieldProvisioning.ps1", [
    "-PlanPath", planPath,
    "-HostConfigPath", HOST_CONFIG,
    "-Apply",
    "-TypedConfirmation", `CREATE FIELD ${fieldId} GENERATION ${generation}`,
  ]);
  const guid = vmGuid(vmName);
  completionCli([
    "field-lifecycle",
    "--field-id", fieldId,
    "--generation", String(generation),
    "--kind", "created",
    "--base-image-sha256", baseDigest,
    "--vm-guid", guid,
  ]);
  const createdAt = lastLifecycleTime(fieldId, generation, "created");

  // HYP-001.8 cold boot from a stopped host state.
  powershell(`Start-VM -Name '${vmName.replace(/'/g, "''")}'`);
  const bootId = deriveBootId(guid, vmPowerOnTime(vmName));
  completionCli([
    "field-lifecycle",
    "--field-id", fieldId,
    "--generation", String(generation),
    "--kind", "booted",
    "--boot-id", bootId,
    "--vm-guid", guid,
  ]);
  const bootedAt = lastLifecycleTime(fieldId, generation, "booted");

  const readinessSeconds = waitForReady(vmName, input.readyTimeoutSeconds);

  // The observation instant for this cycle's evidence. It must fall inside the
  // half-open boot window [booted, stopped), and the window is defined by what
  // the CLI wrote, not by this process's clock — so it is taken after `booted`
  // has been read back and before `stopped` is recorded.
  const readyAt = new Date(Math.max(Date.now(), Date.parse(bootedAt) + 1)).toISOString();

  // HYP-001.9 stop/start without replacing the generation.
  powershell(`Stop-VM -Name '${vmName.replace(/'/g, "''")}' -Force`);
  completionCli([
    "field-lifecycle",
    "--field-id", fieldId,
    "--generation", String(generation),
    "--kind", "stopped",
    "--boot-id", bootId,
  ]);
  const stoppedAt = lastLifecycleTime(fieldId, generation, "stopped");

  // HYP-001.11 destroy confinement — exact typed confirmation, exact
  // generation. The rollback contract is "do not provision or destroy outside
  // the exact generation", so the confirmation is built from the identity this
  // harness itself created and from nothing the operator typed.
  powershellScript("Remove-ExosuitFieldGeneration.ps1", [
    "-FieldId", fieldId,
    "-FieldGeneration", String(generation),
    "-HostConfigPath", HOST_CONFIG,
    "-TypedConfirmation", `DESTROY FIELD ${fieldId} GENERATION ${generation}`,
  ]);
  completionCli([
    "field-lifecycle",
    "--field-id", fieldId,
    "--generation", String(generation),
    "--kind", "destroyed",
  ]);
  const destroyedAt = lastLifecycleTime(fieldId, generation, "destroyed");

  // HYP-001.13 immutable base — hashed after every cycle, not only at the end,
  // so a mutation is attributed to the cycle that caused it.
  const config = readJsonFile<{ baseImages: readonly { imageId: string; path: string }[] }>(HOST_CONFIG);
  const basePath = config.baseImages.find((image) => image.imageId === baseImageId)!.path;
  const baseDigestAfter = sha256File(basePath);
  if (baseDigestAfter !== baseDigestBefore) {
    throw new Error(`Base image mutated during cycle ${cycle}: ${baseDigestBefore} -> ${baseDigestAfter}. Critical stop.`);
  }

  return {
    cycle, fieldId, generation, vmName, vmGuid: guid, bootId,
    createdAt, bootedAt, readyAt, stoppedAt, destroyedAt,
    readinessSeconds, baseDigestBefore, baseDigestAfter,
  };
}

function commandCycles(): void {
  const apply = process.argv.includes("--apply");
  const readyTimeoutSeconds = Number.parseInt(arg("--ready-timeout") ?? "900", 10);

  // Preflight always runs — it is read-only, and a dry run is far more useful
  // when it reports the host problems that would stop the real one. It only
  // *blocks* when something is about to be provisioned.
  const preflight = runPreflight();
  writeJsonFile(join(OUT, "preflight.json"), {
    contractVersion: 1, testId: "HYP-001", stage: "preflight", ...preflight,
  });
  if (!preflight.ok) {
    const failures = (preflight.checks as { failures: readonly string[] }).failures;
    if (apply) {
      throw new Error(`Preflight failed; refusing to provision:\n  - ${failures.join("\n  - ")}`);
    }
    console.log(`Preflight FAILED (${failures.length}); --apply would refuse to run:`);
    for (const failure of failures) console.log(`  - ${failure}`);
    console.log("");
  }

  // Reuse the digest preflight already measured rather than re-reading a file
  // it may have just reported as missing. On a failed dry run this is the
  // difference between the recorded reason and a raw ENOENT stack.
  const baseImage = (preflight.checks as {
    baseImage: { imageId: string; path: string; observedDigest?: string };
  }).baseImage;
  const baseImageId = baseImage.imageId;
  const baseDigest = baseImage.observedDigest;

  const fieldId = arg("--field-id") ?? randomUUID();
  const firstGeneration = Number.parseInt(arg("--first-generation") ?? "1", 10);

  if (!apply) {
    console.log("DRY RUN — nothing will be provisioned or destroyed.");
    console.log(JSON.stringify({
      fieldId, baseImageId, baseDigest, memory: MEMORY, readyTimeoutSeconds,
      cycles: Array.from({ length: REQUIRED_CYCLES }, (_, index) => ({
        cycle: index + 1,
        generation: firstGeneration + index,
        vmName: `Exosuit-Field-${fieldId}-G${firstGeneration + index}`,
      })),
    }, null, 2));
    console.log(`\nRe-run with --apply --confirm "${CONFIRMATION}" to execute.`);
    return;
  }
  if (requireArg("--confirm") !== CONFIRMATION) {
    throw new Error(`Apply requires exact typed confirmation: ${CONFIRMATION}`);
  }
  // Unreachable while preflight gates `--apply`, which is the point: if that
  // gate is ever loosened, this fails rather than provisioning against a base
  // image nobody measured.
  if (baseDigest === undefined) throw new Error("Base image digest was never measured; refusing to provision.");

  const cycles: CycleRecord[] = [];
  for (let index = 0; index < REQUIRED_CYCLES; index += 1) {
    // HYP-001.10 reset/replace — each cycle takes a fresh incremented
    // generation, so the previous one is invalid by identity, not by cleanup.
    const record = runOneCycle({
      cycle: index + 1,
      fieldId,
      generation: firstGeneration + index,
      baseImageId,
      baseDigest,
      readyTimeoutSeconds,
    });
    cycles.push(record);
    writeJsonFile(join(OUT, `cycle-${record.cycle}.json`), {
      contractVersion: 1, testId: "HYP-001", stage: "cycle", ...record,
    });
  }

  const run = hyp001RunSchema.parse({
    contractVersion: 1,
    testId: "HYP-001",
    stage: "run",
    machineId: machineIdentity(),
    baseImageId,
    baseDigest,
    requiredCycles: REQUIRED_CYCLES,
    completedCycles: cycles.length,
    cycles,
  });
  writeJsonFile(join(OUT, "run.json"), run);

  const failures = validateHyp001Run(run);
  if (failures.length > 0) {
    console.error(`\nRun completed but does not satisfy HYP-001 (${failures.length} failures):`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
    return;
  }
  console.log(`\n${cycles.length}/${REQUIRED_CYCLES} cycles complete. Artifacts in ${OUT}.`);
  console.log("Nothing has been recorded as evidence yet. Review the artifacts, then run `record`.");
}

/* ----------------------------------------------------------------- record */

/**
 * Records one evidence artifact per cycle. Separate from `cycles` so a partial
 * or failed run leaves no claim behind, and so the operator reads the
 * artifacts before anything is signed.
 */
function commandRecord(): void {
  const manifest = readJsonFile<BuildCompletionManifest>(join(DIR, "manifest.json"));
  const runPath = join(OUT, "run.json");
  if (!existsSync(runPath)) throw new Error(`No run to record: ${runPath} is missing.`);
  const run = hyp001RunSchema.parse(readJsonFile(runPath));

  // Judged before anything is signed. Recording a run that cannot pass would
  // burn the artifacts — evidence is single-use — and produce a rejection whose
  // reason is harder to read than this one.
  const failures = validateHyp001Run(run);
  if (failures.length > 0) {
    console.error(`Run is not recordable (${failures.length} failures):`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
    return;
  }

  const runId = `hyp001-${Date.now()}`;
  for (const cycle of run.cycles) {
    completionCli([
      "record-artifact",
      "--test", "HYP-001",
      "--class", "hyperv_host_guest",
      "--file", join(OUT, `cycle-${cycle.cycle}.json`),
      "--field-id", cycle.fieldId,
      "--field-generation", String(cycle.generation),
      "--field-boot-id", cycle.bootId,
      "--observed-at", cycle.readyAt,
      "--run-id", runId,
      "--issuer", "hyp001-harness",
      "--evidence-id", `hyp001-cycle-${cycle.cycle}-${cycle.bootId.slice(0, 12)}`,
    ]);
  }
  console.log(`\nRecorded ${run.cycles.length} evidence records against baseline ${manifest.baselineCommit}.`);
  console.log("Recording is a claim, not a judgment. Run `npm run validate:completion` to see how it evaluates.");
  console.log("Promotion is a separate signed transition and needs a reviewer who is not the issuer.");
}

/* ------------------------------------------------------------------- main */

function main(): void {
  mkdirSync(OUT, { recursive: true });
  const command = process.argv[2];
  switch (command) {
    case "preflight": return commandPreflight();
    case "cycles": return commandCycles();
    case "record": return commandRecord();
    default:
      console.error("Usage: hyp001Harness.ts <preflight|cycles|record>");
      process.exitCode = 1;
  }
}

main();
