import { pathToFileURL } from "node:url";

import { createHyperVGuestExchangeReader } from "../src/fieldKvpHyperVReader.js";
import { readGuestKvpSnapshot, type GuestExchangeReader } from "../src/fieldKvpHostQuery.js";
import runPowerShell from "./field-kvp-powershell-runner.mjs";

/**
 * Read-only SCN-001 host probe.
 *
 * This is intentionally narrower than the SCN-001 evidence harness. It proves that the concrete
 * PowerShell/Hyper-V adapter can locate exactly one requested Field VM, traverse to its KVP
 * exchange component, read GuestExchangeItems, and feed those items through the repository's
 * parser. It never emits KVP values: scene payloads can contain user-visible desktop structure and
 * do not belong in a terminal transcript by default.
 *
 * A successful probe is capability evidence only. It does not promote SCN-001 and does not prove
 * authentication, replay handling, desktop invalidation, producer lifecycle, or any other live
 * ceremony in SCN001_SESSION_RUNBOOK.md.
 */

export type Scn001HostProbeSummary = {
  readonly status: "ok" | "parsed_with_failures";
  readonly vmName: string;
  readonly exchangeItemCount: number;
  readonly fieldValueNames: readonly string[];
  readonly scenePublished: boolean;
  readonly parseFailureCount: number;
};

export type Scn001HostProbeResult =
  | Scn001HostProbeSummary
  | { readonly status: "failed"; readonly vmName: string; readonly reason: string };

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

function requestedVmName(): string {
  const value = argument("--vm-name") ?? process.env["EXOSUIT_FIELD_VM_NAME"];
  if (value === undefined || value.trim() === "") {
    throw new Error(
      "Field VM name is required. Pass --vm-name <name> or set EXOSUIT_FIELD_VM_NAME.",
    );
  }
  return value.trim();
}

/**
 * Build the only terminal-safe success record. Values are intentionally discarded here so a
 * caller cannot accidentally serialize a scene payload by printing this object.
 */
export function summarizeSnapshot(input: {
  readonly vmName: string;
  readonly snapshot: Readonly<Record<string, string>>;
  readonly parseFailureCount: number;
}): Scn001HostProbeSummary {
  const names = Object.keys(input.snapshot).sort();
  const fieldValueNames = names.filter((name) => name.startsWith("Exosuit.Field."));
  return {
    status: input.parseFailureCount === 0 ? "ok" : "parsed_with_failures",
    vmName: input.vmName,
    exchangeItemCount: names.length,
    fieldValueNames,
    scenePublished: names.includes("Exosuit.Field.Scene"),
    parseFailureCount: input.parseFailureCount,
  };
}

/**
 * Execute one read-only host query. The reader and platform are injectable so hosted CI can prove
 * the orchestration without pretending it exercised Hyper-V.
 */
export async function runScn001HostProbe(input: {
  readonly vmName: string;
  readonly read?: GuestExchangeReader;
  readonly platform?: NodeJS.Platform;
}): Promise<Scn001HostProbeResult> {
  const platform = input.platform ?? process.platform;
  if (platform !== "win32") {
    throw new Error("SCN-001 host probe requires a Windows Hyper-V host.");
  }

  const read = input.read ?? createHyperVGuestExchangeReader(runPowerShell);
  const result = await readGuestKvpSnapshot({ vmName: input.vmName, read });
  if (result.status === "failed") {
    return { status: "failed", vmName: input.vmName, reason: result.reason };
  }

  return summarizeSnapshot({
    vmName: input.vmName,
    snapshot: result.snapshot,
    parseFailureCount: result.failures.length,
  });
}

async function main(): Promise<void> {
  const vmName = requestedVmName();
  const result = await runScn001HostProbe({ vmName });

  if (result.status === "failed") {
    console.error(JSON.stringify(result, null, 2));
    process.exitCode = 2;
    return;
  }

  console.log(JSON.stringify(result, null, 2));
  if (result.status === "parsed_with_failures") process.exitCode = 3;
}

const entrypoint = process.argv[1];
if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) {
  main().catch((error: unknown) => {
    console.error(JSON.stringify({
      status: "failed",
      reason: error instanceof Error ? error.message : String(error),
    }, null, 2));
    process.exitCode = 1;
  });
}
