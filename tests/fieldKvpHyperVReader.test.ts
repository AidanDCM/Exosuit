import { describe, expect, it } from "vitest";

import { createHyperVGuestExchangeReader, decodeExchangeItems } from "../src/fieldKvpHyperVReader.js";
import { readGuestKvpSnapshot } from "../src/fieldKvpHostQuery.js";

const VM = "Exosuit-Field-4401b702-334f-475e-b867-b7d06798443d-G3";

function item(name: string, data: string): string {
  return `<INSTANCE CLASSNAME="Msvm_KvpExchangeDataItem">`
    + `<PROPERTY NAME="Name" TYPE="string"><VALUE>${name}</VALUE></PROPERTY>`
    + `<PROPERTY NAME="Data" TYPE="string"><VALUE>${data}</VALUE></PROPERTY>`
    + `</INSTANCE>`;
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

describe("guest exchange decoding", () => {
  it("decodes a base64 UTF-8 JSON array", () => {
    const items = [item("Exosuit.Field.Scene", "a"), item("OSName", "Windows")];

    expect(decodeExchangeItems(encode(items))).toEqual(items);
  });

  it("accepts a bare string, which is how PowerShell emits a single item", () => {
    // ConvertTo-Json collapses a one-element array to a scalar. Treating that as malformed would
    // break the common case of a guest that has published exactly one value.
    const single = item("Exosuit.Field.Scene", "a");

    expect(decodeExchangeItems(encode(single))).toEqual([single]);
  });

  it("treats null as an empty exchange", () => {
    expect(decodeExchangeItems(encode(null))).toEqual([]);
  });

  it("survives non-ASCII payloads", () => {
    // The reason output is base64 at all: the console codepage would replace these with U+FFFD,
    // and the mangled value would then fail its digest on the host and look like guest corruption.
    const items = [item("Exosuit.Field.Scene", "café — ünïcode")];

    expect(decodeExchangeItems(encode(items))).toEqual(items);
  });

  it("tolerates surrounding whitespace and newlines", () => {
    const items = [item("Exosuit.Field.Scene", "a")];

    expect(decodeExchangeItems(`\r\n  ${encode(items)}  \r\n`)).toEqual(items);
  });

  it("rejects empty output rather than reporting an empty exchange", () => {
    // No output is a failed query. An empty exchange is a real, different answer.
    expect(() => decodeExchangeItems("   ")).toThrow(/no output/);
  });

  it("rejects unreadable JSON", () => {
    expect(() => decodeExchangeItems(Buffer.from("{ not json", "utf8").toString("base64")))
      .toThrow(/unreadable JSON/);
  });

  it("rejects a payload that is not exchange item strings", () => {
    expect(() => decodeExchangeItems(encode([1, 2, 3]))).toThrow(/other than exchange item strings/);
    expect(() => decodeExchangeItems(encode({ items: [] }))).toThrow(/other than exchange item strings/);
  });
});

describe("source boundary", () => {
  it("the src module executes nothing itself", async () => {
    const source = await import("node:fs").then((fs) =>
      fs.readFileSync("src/fieldKvpHyperVReader.ts", "utf8"));

    // src/ is security-relevant and the repository validator forbids process execution there.
    // Asserting it here too means a reviewer sees the intent, not just a validator rule.
    expect(source).not.toContain("node:child_process");
    expect(source).not.toMatch(/(?:exec|execFile|spawn|fork)Sync?\s*\(/);
  });

  it("exports the exact script the out-of-tree runner must execute", async () => {
    const { GUEST_EXCHANGE_SCRIPT } = await import("../src/fieldKvpHyperVReader.js");

    // Exported so the runner in scripts/ cannot drift from what the reader expects.
    expect(GUEST_EXCHANGE_SCRIPT).toContain("Msvm_KvpExchangeComponent");
    expect(GUEST_EXCHANGE_SCRIPT).toContain("$env:EXOSUIT_FIELD_VM_NAME");
  });
});

describe("Hyper-V guest exchange reader", () => {
  it("passes the VM name out of band rather than into the script text", async () => {
    let seenScript = "";
    let seenEnv: Record<string, string> = {};
    const read = createHyperVGuestExchangeReader(async (script, environment) => {
      seenScript = script;
      seenEnv = { ...environment };
      return encode([]);
    });

    await read(VM);

    // Nothing to quote or escape if the name never reaches the script.
    expect(seenEnv["EXOSUIT_FIELD_VM_NAME"]).toBe(VM);
    expect(seenScript).not.toContain(VM);
    expect(seenScript).toContain("$env:EXOSUIT_FIELD_VM_NAME");
  });

  it("requires exactly one matching VM in the script it runs", async () => {
    let seenScript = "";
    const read = createHyperVGuestExchangeReader(async (script) => {
      seenScript = script;
      return encode([]);
    });

    await read(VM);

    // Zero matches is a missing Field; more than one is ambiguous, and picking either would
    // produce an authentic snapshot from a VM nobody chose.
    expect(seenScript).toContain("$vm.Count -ne 1");
    expect(seenScript).toContain("Msvm_KvpExchangeComponent");
  });

  it("refuses an implausible VM name without running anything", async () => {
    let called = false;
    const read = createHyperVGuestExchangeReader(async () => { called = true; return encode([]); });

    await expect(read("vm'; Remove-VM -Name *")).rejects.toThrow(/implausible/);
    expect(called).toBe(false);
  });

  it("propagates a hypervisor failure instead of returning an empty exchange", async () => {
    const read = createHyperVGuestExchangeReader(async () => {
      throw new Error("Expected exactly one Field VM named X but found 0.");
    });

    await expect(read(VM)).rejects.toThrow(/found 0/);
  });

  it("feeds readGuestKvpSnapshot end to end", async () => {
    const read = createHyperVGuestExchangeReader(async () =>
      encode([item("Exosuit.Field.Scene", "scene"), item("OSName", "Windows")]));

    const result = await readGuestKvpSnapshot({ vmName: VM, read });

    expect(result).toEqual({
      status: "ok",
      snapshot: { "Exosuit.Field.Scene": "scene" },
      failures: [],
    });
  });

  it("surfaces a reader failure as a failed snapshot, not an empty one", async () => {
    const read = createHyperVGuestExchangeReader(async () => {
      throw new Error("The Field KVP exchange component is unavailable.");
    });

    const result = await readGuestKvpSnapshot({ vmName: VM, read });

    expect(result.status).toBe("failed");
    expect(result.status === "failed" && result.reason).toContain("unavailable");
  });
});
