import { describe, expect, it } from "vitest";
import { FakeDesktopAgent } from "../src/agent.js";
import { HashChainLedger } from "../src/audit.js";
import { ExosuitOrchestrator } from "../src/orchestrator.js";

describe("Exosuit system pulse", () => {
  it("carries a verified semantic task through observation, policy, execution, and audit", async () => {
    const gatewayLedger = new HashChainLedger();
    const agent = new FakeDesktopAgent({ mode: "sandbox" });
    const exosuit = new ExosuitOrchestrator({ agent, ledger: gatewayLedger });

    const status = await exosuit.getStatus();
    expect(status).toMatchObject({ provider: "fake-sandbox", mode: "sandbox", emergencyStopped: false });

    const observation = await exosuit.observe({ includeElements: true });
    expect(observation.activeWindow?.id).toBe("win-notepad");

    const matches = await exosuit.findElements({ query: "Document text", windowId: "win-notepad" });
    expect(matches.elements.map((element) => element.id)).toContain("el-editor");

    const text = "Exosuit validation successful";
    const setProposal = await exosuit.proposeAction({
      id: "pulse-set-text",
      actionType: "set_element_value",
      route: "os_accessibility",
      targetWindowId: "win-notepad",
      targetElementId: "el-editor",
      text,
      rationale: "Set text in the simulated test document.",
      expected: { kind: "element_value", elementId: "el-editor", equals: text },
      requestedBy: "test",
    });
    expect(setProposal).toMatchObject({ status: "allowed", decision: { status: "allow" } });

    const setResult = await exosuit.executeProposal(setProposal.proposalId);
    expect(setResult).toMatchObject({ status: "succeeded", verificationStatus: "passed" });

    const saveProposal = await exosuit.proposeAction({
      id: "pulse-save",
      actionType: "invoke_element",
      route: "os_accessibility",
      targetWindowId: "win-notepad",
      targetElementId: "el-save",
      rationale: "Invoke the simulated save control after the value is verified.",
      expected: { kind: "provider_evidence", key: "savedText", equals: text },
      requestedBy: "test",
    });
    expect(saveProposal.status).toBe("allowed");

    const saveResult = await exosuit.executeProposal(saveProposal.proposalId);
    expect(saveResult).toMatchObject({ status: "succeeded", verificationStatus: "passed" });

    const audit = await exosuit.getAuditTail(100);
    const agentExecutions = audit.agent.filter((event) => event.eventType === "action_executed");
    const gatewayResults = audit.gateway.filter((event) => event.eventType === "mcp_action_result");
    expect(agentExecutions).toHaveLength(2);
    expect(gatewayResults).toHaveLength(2);
    expect(exosuit.verifyGatewayLedger()).toEqual({ valid: true, checked: audit.gateway.length });

    const stop = await exosuit.emergencyStop("system pulse completed");
    expect(stop.stopped).toBe(true);

    const blocked = await exosuit.proposeAction({
      id: "pulse-after-stop",
      actionType: "set_element_value",
      route: "os_accessibility",
      targetWindowId: "win-notepad",
      targetElementId: "el-editor",
      text: "must not execute",
      rationale: "Prove emergency stop remains authoritative.",
      expected: { kind: "element_value", elementId: "el-editor", equals: "must not execute" },
      requestedBy: "test",
    });
    expect(blocked).toMatchObject({ status: "blocked", decision: { policyRule: "emergency-stop-lock" } });
  });
});
