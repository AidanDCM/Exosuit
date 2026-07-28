import {
  AgentChannelAuthenticator,
  type SignedAgentHeartbeat,
  type SignedAgentRegistration,
} from "./agentChannelAuth.js";
import { AgentRegistry, type SupervisorAgent } from "./supervisor.js";

export class AuthenticatedAgentRegistrar {
  readonly #authenticator: AgentChannelAuthenticator;
  readonly #registry: AgentRegistry;

  constructor(options: {
    authenticator: AgentChannelAuthenticator;
    registry: AgentRegistry;
  }) {
    this.#authenticator = options.authenticator;
    this.#registry = options.registry;
  }

  register(input: SignedAgentRegistration, now = new Date()): SupervisorAgent {
    const payload = this.#authenticator.verify(input, now);
    return this.#registry.register({
      contractVersion: 1,
      agentId: payload.agentId,
      machineId: payload.machineId,
      windowsSessionId: payload.windowsSessionId,
      userSessionKind: payload.userSessionKind,
      capabilities: payload.capabilities,
      healthState: "online",
      lastHeartbeatAt: payload.issuedAt,
      softwareVersion: payload.softwareVersion,
      minimumContractVersion: payload.minimumContractVersion,
      maximumContractVersion: payload.maximumContractVersion,
    });
  }

  /**
   * Record a heartbeat only from a signature-verified agent.
   *
   * A heartbeat is not merely a liveness ping: it restates capabilities and software
   * version, and `AgentRegistry.select` routes work by capability. An unauthenticated
   * heartbeat would therefore let anything that can reach the endpoint enlarge an agent's
   * capability set and redirect work to it.
   *
   * The signed payload carries `machineId` and `windowsSessionId`, and both must match the
   * identity the agent registered under. An `agentId` alone is not treated as identity,
   * mirroring the registry rule that an agent ID cannot be rebound to another machine.
   */
  heartbeat(input: SignedAgentHeartbeat, now = new Date()): SupervisorAgent {
    const payload = this.#authenticator.verifyHeartbeat(input, now);
    const registered = this.#registry.get(payload.agentId);
    if (!registered) {
      throw new Error(`Agent ${payload.agentId} is not registered.`);
    }
    if (
      registered.machineId !== payload.machineId ||
      registered.windowsSessionId !== payload.windowsSessionId
    ) {
      throw new Error("Agent heartbeat identity does not match the registered agent.");
    }
    return this.#registry.heartbeat({
      agentId: payload.agentId,
      at: payload.issuedAt,
      healthState: payload.healthState,
      capabilities: payload.capabilities,
      softwareVersion: payload.softwareVersion,
    });
  }
}
