import { describe, expect, it } from "vitest";
import { AgentRegistry, type SupervisorAgent } from "../src/supervisor.js";
import {
  SupervisorRouter,
  createTransferEnvelope,
  verifyTransferEnvelope,
  type AgentCommand,
  type AgentCommandChannel,
  type AgentCommandResult,
} from "../src/supervisorRouter.js";

function agent(overrides: Partial<SupervisorAgent> = {}): SupervisorAgent {
  return {
    contractVersion: 1,
    agentId: "agent-a",
    machineId: "machine-a",
    windowsSessionId: "session-a",
    userSessionKind: "console",
    capabilities: ["uia", "motor"],
    healthState: "online",
    lastHeartbeatAt: "2026-07-21T16:00:00.000Z",
    softwareVersion: "0.1.0",
    minimumContractVersion: 1,
    maximumContractVersion: 1,
    ...overrides,
  };
}

class FakeChannel implements AgentCommandChannel {
  stopped = false;
  constructor(
    readonly agentId: string,
    readonly behavior: "success" | "hang" | "wrong-agent" = "success",
  ) {}

  async execute(command: AgentCommand, signal: AbortSignal): Promise<AgentCommandResult> {
    if (this.behavior === "hang") {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 10_000);
        signal.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(signal.reason);
        });
      });
    }
    return {
      commandId: command.commandId,
      agentId: this.behavior === "wrong-agent" ? "impostor" : this.agentId,
      workflowId: command.workflowId,
      stepId: command.stepId,
      status: "succeeded",
      verificationStatus: "passed",
      summary: "Verified fake execution.",
      data: { echoed: command.payload },
      completedAt: new Date().toISOString(),
    };
  }

  async stop(_reason: string): Promise<void> {
    this.stopped = true;
  }
}

describe("multi-agent supervisor router", () => {
  it("routes by capability and preferred session with response identity verification", async () => {
    const registry = new AgentRegistry();
    registry.register(agent());
    registry.register(
      agent({
        agentId: "agent-vm",
        machineId: "machine-vm",
        windowsSessionId: "session-vm",
        userSessionKind: "vm",
        capabilities: ["uia", "browser"],
      }),
    );
    const router = new SupervisorRouter({ registry, timeoutMs: 1_000 });
    router.attach("agent-a", new FakeChannel("agent-a"));
    router.attach("agent-vm", new FakeChannel("agent-vm"));

    const dispatched = await router.dispatch({
      workflowId: "workflow-a",
      stepId: "browser-step",
      commandType: "execute_step",
      payload: { action: "inspect-tab" },
      requiredCapabilities: ["uia", "browser"],
      contractVersion: 1,
      preferredSessionKind: "vm",
    });
    expect(dispatched.agent.agentId).toBe("agent-vm");
    expect(dispatched.result.status).toBe("succeeded");
    expect(dispatched.result.data).toEqual({ echoed: { action: "inspect-tab" } });
  });

  it("fails closed for missing channels, wrong identities, and deadlines", async () => {
    const registry = new AgentRegistry();
    registry.register(agent());
    const router = new SupervisorRouter({ registry, timeoutMs: 100 });
    await expect(
      router.dispatch({
        workflowId: "workflow-a",
        stepId: "step-a",
        commandType: "observe",
        payload: {},
        requiredCapabilities: ["uia"],
        contractVersion: 1,
      }),
    ).rejects.toThrow(/no authenticated command channel/);

    router.attach("agent-a", new FakeChannel("agent-a", "wrong-agent"));
    await expect(
      router.dispatch({
        workflowId: "workflow-a",
        stepId: "step-a",
        commandType: "observe",
        payload: {},
        requiredCapabilities: ["uia"],
        contractVersion: 1,
      }),
    ).rejects.toThrow(/response identity mismatch/);

    router.attach("agent-a", new FakeChannel("agent-a", "hang"));
    await expect(
      router.dispatch({
        workflowId: "workflow-a",
        stepId: "step-a",
        commandType: "execute_step",
        payload: {},
        requiredCapabilities: ["uia"],
        contractVersion: 1,
        timeoutMs: 100,
      }),
    ).rejects.toThrow(/timed out/);
  });

  it("reports per-agent global-stop reachability", async () => {
    const registry = new AgentRegistry();
    registry.register(agent());
    registry.register(
      agent({
        agentId: "agent-b",
        machineId: "machine-b",
        windowsSessionId: "session-b",
      }),
    );
    const channel = new FakeChannel("agent-a");
    const router = new SupervisorRouter({ registry });
    router.attach("agent-a", channel);
    const results = await router.stopAll("operator stop");
    expect(results).toEqual([
      { agentId: "agent-a", reached: true },
      { agentId: "agent-b", reached: false, error: "No authenticated command channel." },
    ]);
    expect(channel.stopped).toBe(true);
    expect(registry.get("agent-a")?.healthState).toBe("stopped");
    expect(registry.get("agent-b")?.healthState).toBe("stopped");
  });

  it("detects cross-agent artifact tampering", () => {
    const envelope = createTransferEnvelope({
      sourceAgentId: "agent-a",
      destinationAgentId: "agent-b",
      workflowId: "workflow-a",
      artifactName: "total",
      classification: "internal",
      payload: { value: 84 },
    });
    expect(() => verifyTransferEnvelope(envelope)).not.toThrow();
    expect(() => verifyTransferEnvelope({ ...envelope, payload: { value: 85 } })).toThrow(
      /integrity verification/,
    );
    expect(() =>
      createTransferEnvelope({
        sourceAgentId: "agent-a",
        destinationAgentId: "agent-a",
        workflowId: "workflow-a",
        artifactName: "total",
        classification: "internal",
        payload: 84,
      }),
    ).toThrow(/different source and destination/);
  });
});
