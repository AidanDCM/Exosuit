import { describe, expect, it } from "vitest";

import { isValidFieldVmName, readGuestKvpSnapshot } from "../src/fieldKvpHostQuery.js";

function item(name: string, data: string): string {
  return `<INSTANCE CLASSNAME="Msvm_KvpExchangeDataItem">`
    + `<PROPERTY NAME="Name" TYPE="string"><VALUE>${name}</VALUE></PROPERTY>`
    + `<PROPERTY NAME="Data" TYPE="string"><VALUE>${data}</VALUE></PROPERTY>`
    + `</INSTANCE>`;
}

const VM = "Exosuit-Field-4401b702-334f-475e-b867-b7d06798443d-G3";

describe("Field VM name validation", () => {
  it("accepts a real Field VM name", () => {
    expect(isValidFieldVmName(VM)).toBe(true);
  });

  it("rejects names carrying shell or filter syntax", () => {
    // Constrained rather than escaped: escaping is a property of every call site, a whitelist is
    // a property of the value.
    for (const hostile of [
      "vm'; Remove-VM -Name *",
      "vm\" -or ElementName -like \"*",
      "vm`nStop-VM",
      "vm$(whoami)",
      "vm;shutdown",
      "vm|Out-File",
      "vm name with spaces",
      "",
      "-leading-dash",
      "x".repeat(129),
    ]) {
      expect(isValidFieldVmName(hostile), hostile).toBe(false);
    }
  });
});

describe("host guest-KVP read", () => {
  it("returns a parsed snapshot", async () => {
    const result = await readGuestKvpSnapshot({
      vmName: VM,
      read: async () => [item("Exosuit.Field.Scene", "scene"), item("OSName", "Windows")],
    });

    expect(result).toEqual({ status: "ok", snapshot: { "Exosuit.Field.Scene": "scene" }, failures: [] });
  });

  it("refuses an implausible VM name before calling the hypervisor", async () => {
    let called = false;
    const result = await readGuestKvpSnapshot({
      vmName: "vm'; Remove-VM -Name *",
      read: async () => { called = true; return []; },
    });

    expect(result.status).toBe("failed");
    expect(called).toBe(false);
  });

  it("reports a hypervisor error as failed rather than as an empty exchange", async () => {
    const result = await readGuestKvpSnapshot({
      vmName: VM,
      read: async () => { throw new Error("the Field KVP exchange component is unavailable"); },
    });

    // An empty snapshot here would let a host fault read as "the guest published nothing", which
    // downstream treats as a scene that has gone away rather than as a host-side problem.
    expect(result.status).toBe("failed");
    expect(result.status === "failed" && result.reason).toContain("unavailable");
  });

  it("keeps a usable snapshot when one item is malformed, and surfaces the failure", async () => {
    const result = await readGuestKvpSnapshot({
      vmName: VM,
      read: async () => [item("Exosuit.Field.Scene", "scene"), "<INSTANCE>garbage</INSTANCE>"],
    });

    expect(result.status === "ok" && result.snapshot["Exosuit.Field.Scene"]).toBe("scene");
    expect(result.status === "ok" && result.failures).toHaveLength(1);
  });

  it("distinguishes an empty exchange from a failed read", async () => {
    const empty = await readGuestKvpSnapshot({ vmName: VM, read: async () => [] });
    const failed = await readGuestKvpSnapshot({
      vmName: VM,
      read: async () => { throw new Error("boom"); },
    });

    expect(empty.status).toBe("ok");
    expect(empty.status === "ok" && empty.snapshot).toEqual({});
    expect(failed.status).toBe("failed");
  });

  it("passes the exact VM name through to the reader", async () => {
    const seen: string[] = [];
    await readGuestKvpSnapshot({ vmName: VM, read: async (name) => { seen.push(name); return []; } });

    // Reading the wrong VM yields a perfectly authentic snapshot from the wrong Field, which no
    // signature check downstream would catch.
    expect(seen).toEqual([VM]);
  });
});
