import { createHash } from "node:crypto";
import { z } from "zod";

/**
 * Host-side reassembly of a guest KVP value.
 *
 * Hyper-V KVP values are small, so the guest splits anything larger than one chunk across
 * `<name>.000`, `<name>.001`, … and leaves a manifest at `<name>` naming the chunk count and the
 * SHA-256 of the joined text. This module puts that back together on the host.
 *
 * The reason it is its own module rather than a helper inside the scene path: reassembly has
 * three distinct outcomes, and collapsing them loses the distinction that matters. A value that
 * is *absent* is not the same as a value that is *corrupt*, and neither may be answered with the
 * previous good value. A reader that returns "no scene" for both an empty slot and a failed
 * digest invites a caller to treat corruption as mere quiet.
 */

/** The chunk manifest the guest writes in place of an oversized value. */
export const kvpChunkManifestSchema = z.object({
  contractVersion: z.literal(1),
  transport: z.literal("chunked"),
  chunkCount: z.number().int().min(1).max(32),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();

export type KvpReadResult =
  /** The value is not present at all. Nothing was published, or it was cleared. */
  | { readonly status: "absent" }
  /** The value is present but cannot be trusted. The reason is always specific. */
  | { readonly status: "unreadable"; readonly reason: string }
  /** A complete, digest-verified value. */
  | { readonly status: "ok"; readonly value: string };

/** Chunk count is bounded so a hostile manifest cannot make the host walk an unbounded set. */
export const MAXIMUM_CHUNKS = 32;

/**
 * Reassembles `name` from a KVP snapshot.
 *
 * Every failure below returns `unreadable` with a specific reason rather than throwing, because
 * the caller's correct response to all of them is identical — invalidate, do not reuse the last
 * scene — and a thrown error tends to be caught somewhere that turns it back into silence.
 */
export function readKvpValue(snapshot: Readonly<Record<string, string>>, name: string): KvpReadResult {
  const raw = snapshot[name];
  if (raw === undefined) return { status: "absent" };

  // A plain value is anything that is not a chunk manifest. Scene payloads are JSON objects
  // too, so the manifest is identified by its exact shape rather than by "looks like JSON".
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: "ok", value: raw };
  }

  const manifest = kvpChunkManifestSchema.safeParse(parsed);
  if (!manifest.success) return { status: "ok", value: raw };

  const parts: string[] = [];
  for (let index = 0; index < manifest.data.chunkCount; index += 1) {
    const key = `${name}.${index.toString().padStart(3, "0")}`;
    const chunk = snapshot[key];
    if (chunk === undefined) {
      return { status: "unreadable", reason: `chunked value is missing ${key}` };
    }
    parts.push(chunk);
  }

  // A trailing chunk beyond the declared count means the snapshot holds fragments of two
  // different writes. Joining only the declared prefix would silently produce a value that was
  // never published as such.
  const strayKey = `${name}.${manifest.data.chunkCount.toString().padStart(3, "0")}`;
  if (snapshot[strayKey] !== undefined) {
    return {
      status: "unreadable",
      reason: `chunked value declares ${manifest.data.chunkCount} chunks but ${strayKey} is also present`,
    };
  }

  const joined = parts.join("");
  const digest = createHash("sha256").update(joined, "utf8").digest("hex");
  if (digest !== manifest.data.sha256) {
    return {
      status: "unreadable",
      reason: `chunked value digest ${digest} does not match the declared ${manifest.data.sha256}`,
    };
  }

  if (joined.length === 0) {
    return { status: "unreadable", reason: "chunked value reassembled to nothing" };
  }

  return { status: "ok", value: joined };
}

/**
 * Reads a value and parses it as JSON, keeping the same three outcomes. A value that reassembles
 * cleanly but is not parseable JSON is corrupt, not absent.
 */
export type KvpJsonReadResult =
  | { readonly status: "absent" }
  | { readonly status: "unreadable"; readonly reason: string }
  | { readonly status: "ok"; readonly value: unknown };

export function readKvpJson(
  snapshot: Readonly<Record<string, string>>,
  name: string,
): KvpJsonReadResult {
  const result = readKvpValue(snapshot, name);
  if (result.status !== "ok") return result;
  try {
    return { status: "ok", value: JSON.parse(result.value) };
  } catch (error) {
    return {
      status: "unreadable",
      reason: `value is not parseable JSON: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
