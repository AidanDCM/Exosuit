import { describe, expect, it } from "vitest";

import { runScn001HostProbe, summarizeSnapshot } from "../scripts/scn001-host-probe.js";

const VM = "Exosuit-Field-4401b702-334f-475e-b867-b7d06798443d-G3";

function item(name: string, data: string): string {
  return `<INSTANCE CLASSNAME="Msvm_KvpExchangeDataItem">`
    + `<PROPERTY NAME="Name" TYPE="string"><VALUE>${name}</VALUE></PROPERTY>`
    + `<PROPERTY NAME="Data" TYPE="string"><VALUE>${data}</VALUE></PROPERTY>`
    + `</INSTANCE>`;
}

describe("SCN-001 host probe", () => {
  it("reports names and counts without leaking KVP values", () => {
    const sensitiveScene = "desktop-window-title-that-must-not-be-printed";
    const summary = summarizeSnapshot({
      vmName: VM,
      snapshot: {
        "Exosuit.Field.Scene": sensitiveScene,
        "Exosuit.Field.Heartbeat": "heartbeat-secret-shaped-value",
        OSName: "Windows",
      },
      parseFailureCount: 0,
    });

    expect(summary).toEqual({
      status: "ok",
      vmName: VM,
      exchangeItemCount: 3,
      fieldValueNames: ["Exosuit.Field.Heartbeat", "Exosuit.Field.Scene"],
      scenePublished: true,
      parseFailureCount: 0,
    });
    expect(JSON.stringify(summary)).not.toContain(sensitiveScene);
    expect(JSON.stringify(summary)).not.toContain("heartbeat-secret-shaped-value");
  });

  it("runs the real host-query parser behind an injected reader", async () => {
    const result = await runScn001HostProbe({
      vmName: VM,
      platform: "win32",
      read: async (vmName) => {
        expect(vmName).toBe(VM);
        return [
          item("Exosuit.Field.Scene", "opaque-scene-envelope"),
          item("OSName", "Windows"),
        ];
      },
    });

    expect(result).toEqual({
      status: "ok",
      vmName: VM,
      exchangeItemCount: 1,
      fieldValueNames: ["Exosuit.Field.Scene"],
      scenePublished: true,
      parseFailureCount: 0,
    });
  });

  it("keeps a Hyper-V failure distinct from an empty guest exchange", async () => {
    const result = await runScn001HostProbe({
      vmName: VM,
      platform: "win32",
      read: async () => {
        throw new Error("The Field KVP exchange component is unavailable.");
      },
    });

    expect(result).toEqual({
      status: "failed",
      vmName: VM,
      reason: "The Field KVP exchange component is unavailable.",
    });
  });

  it("refuses to imply Hyper-V coverage on a non-Windows host", async () => {
    await expect(runScn001HostProbe({
      vmName: VM,
      platform: "linux",
      read: async () => [],
    })).rejects.toThrow(/Windows Hyper-V host/);
  });
});
