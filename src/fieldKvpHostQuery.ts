import { parseGuestExchangeItems } from "./fieldKvpExchangeParser.js";

/**
 * The host-side read of a Field guest's KVP exchange.
 *
 * The Hyper-V call itself is injected rather than performed here. That is not only for testing:
 * it keeps the decision about *which VM* is being read — the part that can go wrong in a way no
 * signature check would catch — in code that can be exercised without a hypervisor. Reading the
 * wrong VM produces a perfectly authentic snapshot from the wrong Field.
 */

/** Runs the host query and returns one raw CIM-XML exchange item per element. */
export type GuestExchangeReader = (vmName: string) => Promise<readonly string[]>;

export type HostKvpQueryResult =
  | { readonly status: "ok"; readonly snapshot: Record<string, string>; readonly failures: readonly string[] }
  | { readonly status: "failed"; readonly reason: string };

/**
 * VM names reach PowerShell and CIM filters, so they are constrained to what a Field VM name can
 * actually contain rather than escaped on the way out. Escaping is a property of every call site;
 * a whitelist is a property of the value.
 */
const VM_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export function isValidFieldVmName(vmName: string): boolean {
  return VM_NAME.test(vmName);
}

/**
 * Reads and parses one guest's exchange.
 *
 * Parse failures do not fail the read. A single malformed item must not blank an otherwise
 * usable snapshot — the scene reader downstream already treats a missing or corrupt scene value
 * as invalidation, and it does so with a specific reason. Failures are carried alongside the
 * snapshot so a caller can surface them without losing what did parse.
 */
export async function readGuestKvpSnapshot(input: {
  readonly vmName: string;
  readonly read: GuestExchangeReader;
}): Promise<HostKvpQueryResult> {
  if (!isValidFieldVmName(input.vmName)) {
    return { status: "failed", reason: `refusing an implausible Field VM name: ${JSON.stringify(input.vmName)}` };
  }

  let items: readonly string[];
  try {
    items = await input.read(input.vmName);
  } catch (error) {
    // A failed read is not an empty exchange. Returning an empty snapshot here would let a
    // hypervisor error read as "the guest published nothing", which downstream would treat as a
    // scene that has gone away rather than as a host-side fault.
    return { status: "failed", reason: error instanceof Error ? error.message : String(error) };
  }

  const parsed = parseGuestExchangeItems(items);
  return { status: "ok", snapshot: parsed.snapshot, failures: parsed.failures };
}
