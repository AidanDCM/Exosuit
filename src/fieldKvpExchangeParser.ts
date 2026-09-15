/**
 * Parses Hyper-V `GuestExchangeItems` into the flat snapshot the scene reader consumes.
 *
 * Each item is a CIM-XML `INSTANCE` carrying a `Name` and a `Data` property. This module turns a
 * list of those strings into `Record<name, data>`.
 *
 * **Why this does not use a general XML parser.** The input is attacker-influenced: the guest
 * writes these values, and a compromised guest controls the bytes entirely. A general parser
 * brings entity expansion and external-entity resolution with it, and the mitigation is always a
 * configuration flag someone can later flip. The structure needed here is two fixed properties at
 * fixed paths, so the parser is a strict targeted extraction that understands nothing else. A
 * document declaring a DOCTYPE or an ENTITY is rejected outright rather than parsed carefully —
 * there is no legitimate reason for one to appear, so its presence is itself the finding.
 */

/** Only Field-owned names are admitted; anything else in the exchange is ignored. */
export const FIELD_KVP_NAME_PREFIX = "Exosuit.Field.";

/** A single item never legitimately approaches this; the bound stops a hostile guest from making the host chew. */
export const MAXIMUM_ITEM_CHARACTERS = 64 * 1024;

/** Hyper-V caps the exchange; a snapshot far beyond this is a fault, not a large scene. */
export const MAXIMUM_ITEMS = 256;

export type KvpItemParse =
  | { readonly status: "ok"; readonly name: string; readonly data: string }
  | { readonly status: "ignored" }
  | { readonly status: "invalid"; readonly reason: string };

export interface KvpSnapshotParse {
  readonly snapshot: Record<string, string>;
  /** Specific reasons for every item that was rejected. Never silently dropped. */
  readonly failures: readonly string[];
}

const NAME_PROPERTY = /<PROPERTY\b[^>]*\bNAME\s*=\s*"Name"[^>]*>\s*<VALUE>([\s\S]*?)<\/VALUE>/i;
const DATA_PROPERTY = /<PROPERTY\b[^>]*\bNAME\s*=\s*"Data"[^>]*>\s*<VALUE>([\s\S]*?)<\/VALUE>/i;

/** The five predefined XML entities. Nothing else is expanded, by design. */
function decodeBasicEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    // Ampersand last, so a decoded value cannot be re-decoded into a different entity.
    .replace(/&amp;/g, "&");
}

export function parseGuestExchangeItem(item: string): KvpItemParse {
  if (item.length > MAXIMUM_ITEM_CHARACTERS) {
    return { status: "invalid", reason: `exchange item exceeds ${MAXIMUM_ITEM_CHARACTERS} characters` };
  }
  if (/<!DOCTYPE/i.test(item) || /<!ENTITY/i.test(item)) {
    // Presence alone is the finding; there is no legitimate reason for either to appear here.
    return { status: "invalid", reason: "exchange item declares a DOCTYPE or ENTITY" };
  }

  const name = NAME_PROPERTY.exec(item);
  const data = DATA_PROPERTY.exec(item);
  if (name === null) return { status: "invalid", reason: "exchange item has no Name property" };
  if (data === null) return { status: "invalid", reason: "exchange item has no Data property" };

  const decodedName = decodeBasicEntities(name[1] ?? "");
  if (!decodedName.startsWith(FIELD_KVP_NAME_PREFIX)) return { status: "ignored" };

  return { status: "ok", name: decodedName, data: decodeBasicEntities(data[1] ?? "") };
}

/**
 * Parses a whole exchange.
 *
 * A duplicate name is a hard ambiguity for that key. Once a duplicate is observed the key is
 * removed from the snapshot and remains suppressed even if further copies follow. Retaining the
 * first or last value would hand downstream authentication an arbitrarily selected value from an
 * exchange that has already proven it cannot attribute uniquely.
 */
export function parseGuestExchangeItems(items: readonly string[]): KvpSnapshotParse {
  const snapshot: Record<string, string> = {};
  const failures: string[] = [];
  const ambiguousNames = new Set<string>();

  if (items.length > MAXIMUM_ITEMS) {
    return { snapshot: {}, failures: [`exchange holds ${items.length} items, above the ${MAXIMUM_ITEMS} bound`] };
  }

  for (const [index, item] of items.entries()) {
    const parsed = parseGuestExchangeItem(item);
    if (parsed.status === "ignored") continue;
    if (parsed.status === "invalid") {
      failures.push(`item ${index}: ${parsed.reason}`);
      continue;
    }

    if (ambiguousNames.has(parsed.name)) {
      failures.push(`item ${index}: duplicate exchange name ${parsed.name}`);
      continue;
    }
    if (Object.hasOwn(snapshot, parsed.name)) {
      // The first value is no safer than the second once ambiguity is known. Remove it and mark
      // the name poisoned for the remainder of this snapshot so a third copy cannot reappear.
      delete snapshot[parsed.name];
      ambiguousNames.add(parsed.name);
      failures.push(`item ${index}: duplicate exchange name ${parsed.name}`);
      continue;
    }

    snapshot[parsed.name] = parsed.data;
  }

  return { snapshot, failures };
}
