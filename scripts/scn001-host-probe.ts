import { createHyperVGuestExchangeReader } from "../src/fieldKvpHyperVReader.js";
import { readGuestKvpSnapshot } from "../src/fieldKvpHostQuery.js";
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

async function main(): Promise<void> {
  if (process.platform !== "win32") {
    throw new Error("SCN-001 host probe requires a Windows Hyper-V host.");
  }

  const vmName = requestedVmName();
  const read = createHyperVGuestExchangeReader(runPowerShell);
  const result = await readGuestKvpSnapshot({ vmName, read });

  if (result.status === "failed") {
    console.error(JSON.stringify({ status: "failed", vmName, reason: result.reason }, null, 2));
    process.exitCode = 2;
    return;
  }

  const names = Object.keys(result.snapshot).sort();
  const fieldValueNames = names.filter((name) => name.startsWith("Exosuit.Field."));
  const summary = {
    status: result.failures.length === 0 ? "ok" : "parsed_with_failures",
    vmName,
    exchangeItemCount: names.length,
    fieldValueNames,
    scenePublished: names.includes("Exosuit.Field.Scene"),
    parseFailureCount: result.failures.length,
  } as const;

  console.log(JSON.stringify(summary, null, 2));
  if (result.failures.length > 0) process.exitCode = 3;
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({
    status: "failed",
    reason: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exitCode = 1;
});
