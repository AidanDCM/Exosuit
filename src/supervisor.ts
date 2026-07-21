import { z } from "zod";

export const agentHealthSchema = z.enum(["online", "degraded", "offline", "stopped"]);
export type AgentHealth = z.infer<typeof agentHealthSchema>;

export const supervisorAgentSchema = z.object({
  contractVersion: z.literal(1),
  agentId: z.string().min(1),
  machineId: z.string().min(1),
  windowsSessionId: z.string().min(1),
  userSessionKind: z.enum(["console", "vm", "rdp", "cloud"]),
  capabilities: z.array(z.string().min(1)).max(200),
  healthState: agentHealthSchema,
  lastHeartbeatAt: z.string().datetime(),
  softwareVersion: z.string().min(1),
  minimumContractVersion: z.number().int().positive(),
  maximumContractVersion: z.number().int().positive(),
});
export type SupervisorAgent = z.infer<typeof supervisorAgentSchema>;

export type AgentSelection = {
  agent: SupervisorAgent;
  matchedCapabilities: string[];
};

export class AgentRegistry {
  readonly #agents = new Map<string, SupervisorAgent>();

  register(input: SupervisorAgent): SupervisorAgent {
    const agent = supervisorAgentSchema.parse(input);
    if (agent.minimumContractVersion > agent.maximumContractVersion) {
      throw new Error("Agent minimum contract version cannot exceed its maximum version.");
    }
    const prior = this.#agents.get(agent.agentId);
    if (prior && (prior.machineId !== agent.machineId || prior.windowsSessionId !== agent.windowsSessionId)) {
      throw new Error("An agent ID cannot be rebound to another machine or Windows session.");
    }
    this.#agents.set(agent.agentId, agent);
    return structuredClone(agent);
  }

  heartbeat(input: {
    agentId: string;
    at?: string;
    healthState?: Extract<AgentHealth, "online" | "degraded">;
    capabilities?: string[];
    softwareVersion?: string;
  }): SupervisorAgent {
    const agent = this.#agents.get(input.agentId);
    if (!agent) throw new Error(`Agent ${input.agentId} is not registered.`);
    if (agent.healthState === "stopped") throw new Error("A stopped agent must be restarted and re-registered.");
    const next = supervisorAgentSchema.parse({
      ...agent,
      healthState: input.healthState ?? "online",
      lastHeartbeatAt: input.at ?? new Date().toISOString(),
      capabilities: input.capabilities ?? agent.capabilities,
      softwareVersion: input.softwareVersion ?? agent.softwareVersion,
    });
    this.#agents.set(next.agentId, next);
    return structuredClone(next);
  }

  get(agentId: string): SupervisorAgent | undefined {
    const agent = this.#agents.get(agentId);
    return agent ? structuredClone(agent) : undefined;
  }

  list(): SupervisorAgent[] {
    return [...this.#agents.values()].map((agent) => structuredClone(agent));
  }

  expireStale(input: { now?: Date; staleAfterMs: number }): SupervisorAgent[] {
    if (!Number.isInteger(input.staleAfterMs) || input.staleAfterMs < 1_000 || input.staleAfterMs > 3_600_000) {
      throw new Error("staleAfterMs must be between 1000 and 3600000.");
    }
    const now = input.now ?? new Date();
    const changed: SupervisorAgent[] = [];
    for (const agent of this.#agents.values()) {
      if (agent.healthState === "stopped") continue;
      if (now.getTime() - Date.parse(agent.lastHeartbeatAt) <= input.staleAfterMs) continue;
      const offline = supervisorAgentSchema.parse({ ...agent, healthState: "offline" });
      this.#agents.set(agent.agentId, offline);
      changed.push(structuredClone(offline));
    }
    return changed;
  }

  stop(agentId: string): SupervisorAgent {
    const agent = this.#agents.get(agentId);
    if (!agent) throw new Error(`Agent ${agentId} is not registered.`);
    const stopped = supervisorAgentSchema.parse({ ...agent, healthState: "stopped" });
    this.#agents.set(agentId, stopped);
    return structuredClone(stopped);
  }

  stopAll(): { stopped: SupervisorAgent[]; alreadyUnavailable: string[] } {
    const stopped: SupervisorAgent[] = [];
    const alreadyUnavailable: string[] = [];
    for (const agent of this.#agents.values()) {
      if (agent.healthState === "offline" || agent.healthState === "stopped") {
        alreadyUnavailable.push(agent.agentId);
        continue;
      }
      stopped.push(this.stop(agent.agentId));
    }
    return { stopped, alreadyUnavailable: alreadyUnavailable.sort() };
  }

  select(input: {
    requiredCapabilities: string[];
    contractVersion: number;
    preferredSessionKind?: SupervisorAgent["userSessionKind"];
  }): AgentSelection {
    if (!Number.isInteger(input.contractVersion) || input.contractVersion < 1) {
      throw new Error("A positive contract version is required.");
    }
    const required = [...new Set(input.requiredCapabilities)].sort();
    const candidates = [...this.#agents.values()]
      .filter((agent) => agent.healthState === "online")
      .filter(
        (agent) =>
          agent.minimumContractVersion <= input.contractVersion && agent.maximumContractVersion >= input.contractVersion,
      )
      .filter((agent) => required.every((capability) => agent.capabilities.includes(capability)))
      .sort((left, right) => {
        const leftPreferred = input.preferredSessionKind && left.userSessionKind === input.preferredSessionKind ? 1 : 0;
        const rightPreferred = input.preferredSessionKind && right.userSessionKind === input.preferredSessionKind ? 1 : 0;
        if (leftPreferred !== rightPreferred) return rightPreferred - leftPreferred;
        return left.agentId.localeCompare(right.agentId);
      });
    const agent = candidates[0];
    if (!agent) throw new Error("No healthy compatible agent can satisfy the requested capabilities.");
    return { agent: structuredClone(agent), matchedCapabilities: required };
  }
}
