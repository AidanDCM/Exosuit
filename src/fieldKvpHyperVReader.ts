import { isValidFieldVmName, type GuestExchangeReader } from "./fieldKvpHostQuery.js";

/**
 * The real Hyper-V guest exchange reader.
 *
 * Reads `Msvm_KvpExchangeComponent.GuestExchangeItems` for one VM and returns the raw CIM-XML
 * items. It performs no parsing and makes no trust decision: `parseGuestExchangeItems` and the
 * scene path downstream own all of that.
 *
 * Three things here were learned the hard way earlier in this branch and are deliberate:
 *
 * 1. **The VM name never enters the script text.** It crosses as an environment variable, so
 *    there is no quoting or escaping to get right at all. The whitelist in `fieldKvpHostQuery`
 *    still applies as defence in depth, but this path does not depend on it.
 * 2. **Output crosses as base64 over UTF-8.** `powershell.exe` writes stdout in the console
 *    codepage, which silently replaces non-ASCII with U+FFFD. A scene payload mangled that way
 *    would fail its digest on the host and look like guest corruption.
 * 3. **Exactly one VM must match.** Zero is a missing Field; more than one is ambiguous, and
 *    picking either would produce a perfectly authentic snapshot from a VM nobody chose.
 *
 * This module runs nothing. `src/` is security-relevant and the repository validator forbids
 * process execution here outright, so the runner is always injected and the only implementation
 * that actually spawns `powershell.exe` lives under `scripts/`. That is the right split
 * regardless of the rule: everything decided here stays a pure function of its inputs.
 */

/** Emits a base64 UTF-8 JSON array of the raw exchange item strings. */
const READ_SCRIPT = `
$ErrorActionPreference = 'Stop'
$name = $env:EXOSUIT_FIELD_VM_NAME
if ([string]::IsNullOrWhiteSpace($name)) { throw 'EXOSUIT_FIELD_VM_NAME is not set.' }

$vm = @(Get-CimInstance -Namespace 'root\\virtualization\\v2' -ClassName Msvm_ComputerSystem |
    Where-Object { $_.ElementName -eq $name -and $_.Caption -eq 'Virtual Machine' })
if ($vm.Count -ne 1) { throw ('Expected exactly one Field VM named ' + $name + ' but found ' + $vm.Count + '.') }

$component = @(Get-CimAssociatedInstance -InputObject $vm[0] -ResultClassName Msvm_KvpExchangeComponent)
if ($component.Count -ne 1) { throw 'The Field KVP exchange component is unavailable.' }

$items = @($component[0].GuestExchangeItems)
$json = ConvertTo-Json -InputObject $items -Compress -Depth 3
if ($null -eq $json) { $json = '[]' }
[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json))
`;

/**
 * Runs a PowerShell script with an environment overlay and returns stdout.
 *
 * Always injected. The implementation that spawns a process lives in
 * `scripts/field-kvp-powershell-runner.mjs`, outside the source tree.
 */
export type PowerShellRunner = (
  script: string,
  environment: Readonly<Record<string, string>>,
) => Promise<string>;

/** The exact script the runner must execute. Exported so the out-of-tree runner cannot drift. */
export const GUEST_EXCHANGE_SCRIPT = READ_SCRIPT;

/**
 * Builds a reader bound to one PowerShell runner.
 *
 * A failure — no such VM, several matches, an unavailable exchange component, an unreadable
 * response — throws. `readGuestKvpSnapshot` turns that into a `failed` result, which is
 * deliberately not the same as an empty exchange: a host-side fault must never read as "the guest
 * published nothing".
 */
export function createHyperVGuestExchangeReader(runner: PowerShellRunner): GuestExchangeReader {
  return async (vmName: string): Promise<readonly string[]> => {
    if (!isValidFieldVmName(vmName)) {
      throw new Error(`refusing an implausible Field VM name: ${JSON.stringify(vmName)}`);
    }

    const stdout = await runner(READ_SCRIPT, { EXOSUIT_FIELD_VM_NAME: vmName });
    return decodeExchangeItems(stdout);
  };
}

/** Decodes the base64 UTF-8 JSON the script emits, rejecting anything that is not a string array. */
export function decodeExchangeItems(stdout: string): readonly string[] {
  const encoded = stdout.trim();
  if (encoded.length === 0) throw new Error("the guest exchange query returned no output");

  let json: string;
  try {
    json = Buffer.from(encoded, "base64").toString("utf8");
  } catch {
    throw new Error("the guest exchange query returned unreadable base64");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("the guest exchange query returned unreadable JSON");
  }

  // PowerShell collapses a single-element array to a scalar, so one item arrives as a bare string.
  if (typeof parsed === "string") return [parsed];
  if (parsed === null) return [];
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
    throw new Error("the guest exchange query returned something other than exchange item strings");
  }
  return parsed as readonly string[];
}
