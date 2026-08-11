import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { readKvpJson, readKvpValue } from "../src/fieldSceneKvpReader.js";

const NAME = "Exosuit.Field.Scene";

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function chunked(value: string, chunkSize = 1000): Record<string, string> {
  const parts: string[] = [];
  for (let index = 0; index < value.length; index += chunkSize) {
    parts.push(value.slice(index, index + chunkSize));
  }
  const snapshot: Record<string, string> = {
    [NAME]: JSON.stringify({
      contractVersion: 1,
      transport: "chunked",
      chunkCount: parts.length,
      sha256: digest(value),
    }),
  };
  parts.forEach((part, index) => {
    snapshot[`${NAME}.${index.toString().padStart(3, "0")}`] = part;
  });
  return snapshot;
}

describe("KVP value reassembly", () => {
  it("reports an absent value as absent, not as corrupt", () => {
    expect(readKvpValue({}, NAME)).toEqual({ status: "absent" });
  });

  it("returns a short unchunked value as-is", () => {
    expect(readKvpValue({ [NAME]: "plain text" }, NAME)).toEqual({ status: "ok", value: "plain text" });
  });

  it("returns a small JSON payload as-is rather than mistaking it for a manifest", () => {
    // Scene payloads are JSON objects too, so the manifest must be identified by exact shape.
    const payload = JSON.stringify({ contractVersion: 1, bootId: "b", agentId: "a" });
    expect(readKvpValue({ [NAME]: payload }, NAME)).toEqual({ status: "ok", value: payload });
  });

  it("reassembles a chunked value and verifies its digest", () => {
    const value = "x".repeat(2500);
    const result = readKvpValue(chunked(value), NAME);

    expect(result).toEqual({ status: "ok", value });
  });

  it("reassembles a chunked value that is exactly one chunk long", () => {
    const value = "y".repeat(1000);
    expect(readKvpValue(chunked(value), NAME)).toEqual({ status: "ok", value });
  });

  it("reports a missing chunk as unreadable and names it", () => {
    const snapshot = chunked("z".repeat(2500));
    delete snapshot[`${NAME}.001`];

    const result = readKvpValue(snapshot, NAME);

    expect(result.status).toBe("unreadable");
    expect(result.status === "unreadable" && result.reason).toContain(`${NAME}.001`);
  });

  it("reports a digest mismatch as unreadable rather than returning the bytes", () => {
    const snapshot = chunked("a".repeat(2500));
    snapshot[`${NAME}.000`] = "b".repeat(1000);

    const result = readKvpValue(snapshot, NAME);

    expect(result.status).toBe("unreadable");
    expect(result.status === "unreadable" && result.reason).toContain("digest");
  });

  it("rejects a snapshot holding fragments of two different writes", () => {
    // A chunk beyond the declared count means an older, longer value is partly still present.
    // Joining only the declared prefix would produce a value that was never published as such.
    const snapshot = chunked("c".repeat(2500));
    snapshot[`${NAME}.003`] = "left over from a previous write";

    const result = readKvpValue(snapshot, NAME);

    expect(result.status).toBe("unreadable");
    expect(result.status === "unreadable" && result.reason).toContain(`${NAME}.003`);
  });

  it("rejects a manifest declaring more chunks than the bound allows", () => {
    const snapshot: Record<string, string> = {
      [NAME]: JSON.stringify({
        contractVersion: 1,
        transport: "chunked",
        chunkCount: 5_000,
        sha256: digest(""),
      }),
    };

    // An out-of-range manifest fails the schema, so it is treated as a plain value rather than
    // sending the host walking an unbounded key set.
    const result = readKvpValue(snapshot, NAME);
    expect(result.status).toBe("ok");
  });

  it("rejects a manifest with an unsupported contract version", () => {
    const snapshot = chunked("d".repeat(2500));
    snapshot[NAME] = JSON.stringify({
      contractVersion: 2,
      transport: "chunked",
      chunkCount: 3,
      sha256: digest("d".repeat(2500)),
    });

    expect(readKvpValue(snapshot, NAME).status).toBe("ok");
  });

  it("never answers a corrupt value with a previously good one", () => {
    const good = chunked("e".repeat(2500));
    expect(readKvpValue(good, NAME).status).toBe("ok");

    const corrupted = { ...good };
    delete corrupted[`${NAME}.002`];

    // The reader is stateless by design: there is no last-good value for it to fall back to.
    const result = readKvpValue(corrupted, NAME);
    expect(result.status).toBe("unreadable");
    expect(result).not.toHaveProperty("value");
  });

  it("distinguishes absent from unreadable so a caller cannot conflate them", () => {
    const absent = readKvpValue({}, NAME);
    const corrupt = readKvpValue({ ...chunked("f".repeat(2500)), [`${NAME}.001`]: "wrong" }, NAME);

    expect(absent.status).toBe("absent");
    expect(corrupt.status).toBe("unreadable");
    expect(absent.status).not.toEqual(corrupt.status);
  });
});

describe("KVP JSON reading", () => {
  it("parses a reassembled JSON value", () => {
    const payload = JSON.stringify({ contractVersion: 1, sequence: 7 });
    const value = payload.padEnd(2500, " ");
    const result = readKvpJson(chunked(value), NAME);

    expect(result.status).toBe("ok");
    expect(result.status === "ok" && result.value).toEqual({ contractVersion: 1, sequence: 7 });
  });

  it("treats an unparseable reassembled value as corrupt, not absent", () => {
    const result = readKvpJson({ [NAME]: "{ not json" }, NAME);

    expect(result.status).toBe("unreadable");
    expect(result.status === "unreadable" && result.reason).toContain("parseable JSON");
  });

  it("passes absence through unchanged", () => {
    expect(readKvpJson({}, NAME)).toEqual({ status: "absent" });
  });
});
