import {
  AgentChannelAuthenticator,
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
}
