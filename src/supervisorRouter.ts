import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { AgentRegistry, type SupervisorAgent } from "./supervisor.js";

export const agentCommandSchema = z.object({
  commandId: z.string().uuid(),
  contractVersion: z.number().int().positive(),
  workflowId: z.string().min(1),
  stepId: z.string().min(1),
  commandType: z.enum(["observe", "execute_step", "verify", "emergency_stop"]),
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.string().datetime(),
  deadlineAt: z.string().datetime(),
});
export type AgentCommand = z.infer<typeof agentCommandSchema>;

export const agentCommandResultSchema = z.object({
  commandId: z.string().uuid(),
  agentId: z.string().min(1),
  workflowId: z.string().min(1),
  stepId: z.string().min(1),
  status: z.enum(["succeeded", "failed", "blocked", "uncertain", "cancelled"]),
  verificationStatus: z.enum(["not_checked", "passed", "failed", "partial"]),
  summary: z.string().min(1).max(10_000),
  data: z.record(z.string(), z.unknown()).default({}),
  completedAt: z.string().datetime(),
});
export type AgentCommandResult = z.infer<typeof agentCommandResultSchema>;

export const transferEnvelopeSchema = z.object({
  transferId: z.string().uuid(),
  sourceAgentId: z.string().min(1),
  destinationAgentId: z.string().min(1),
  workflowId: z.string().min(1),
  artifactName: z.string().min(1).max(200),
  classification: z.enum(["public", "internal", "sensitive"]),
  payload: z.unknown(),
  createdAt: z.string().datetime(),
  integrityHash: z.string().regex(/^[a-f0-9]{64}$/),
});
export type TransferEnvelope = z.infer<typeof transferEnvelopeSchema>;

export interface AgentCommandChannel {
  execute(command: AgentCommand, signal: AbortSignal): Promise<AgentCommandResult>;
  stop(reason: string, signal: AbortSignal): Promise<void>;
}

export class SupervisorRouter {
  readonly #registry: AgentRegistry;
  readonly #channels = new Map<string, AgentCommandChannel>();
  readonly #timeoutMs: number;

  constructor(options: { registry: AgentRegistry; timeoutMs?: number }) {
    this.#registry = options.registry;
    this.#timeoutMs = options.timeoutMs ?? 20_000;
    if (!Number.isInteger(this.#timeoutMs) || this.#timeoutMs < 100 || this.#timeoutMs > 300_000) {
      throw new Error("Supervisor timeout must be between 100 and 300000 milliseconds.");
    }
  }

  attach(agentId: string, channel: AgentCommandChannel): void {
    const agent = this.#registry.get(agentId);
    if (!agent) throw new Error(`Agent ${agentId} must be registered before a channel is attached.`);
    if (agent.healthState === "stopped") throw new Error("A stopped agent cannot accept a channel.");
    this.#channels.set(agentId, channel);
  }

  detach(agentId: string): void {
    this.#channels.delete(agentId);
  }

  async dispatch(input: {
    workflowId: string;
    stepId: string;
    commandType: AgentCommand["commandType"];
    payload: Record<string, unknown>;
    requiredCapabilities: string[];
    contractVersion: number;
    preferredSessionKind?: SupervisorAgent["userSessionKind"];
    timeoutMs?: number;
    signal?: AbortSignal;
  }): Promise<{ agent: SupervisorAgent; result: AgentCommandResult }> {
    const selection = this.#registry.select({
      requiredCapabilities: input.requiredCapabilities,
      contractVersion: input.contractVersion,
      ...(input.preferredSessionKind ? { preferredSessionKind: input.preferredSessionKind } : {}),
    });
    const channel = this.#channels.get(selection.agent.agentId);
    if (!channel) throw new Error(`Agent ${selection.agent.agentId} has no authenticated command channel.`);
    const timeoutMs = input.timeoutMs ?? this.#timeoutMs;
    if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 300_000) {
      throw new Error("Dispatch timeout must be between 100 and 300000 milliseconds.");
    }
    const now = new Date();
    const command = agentCommandSchema.parse({
      commandId: randomUUID(),
      contractVersion: input.contractVersion,
      workflowId: input.workflowId,
      stepId: input.stepId,
      commandType: input.commandType,
      payload: input.payload,
      createdAt: now.toISOString(),
      deadlineAt: new Date(now.getTime() + timeoutMs).toISOString(),
    });
    const result = await withDeadline(
      (signal) => channel.execute(command, signal),
      timeoutMs,
      input.signal,
      `Agent ${selection.agent.agentId} command timed out.`,
    );
    const parsed = agentCommandResultSchema.parse(result);
    if (parsed.commandId !== command.commandId) throw new Error("Agent response command identity mismatch.");
    if (parsed.agentId !== selection.agent.agentId) throw new Error("Agent response identity mismatch.");
    if (parsed.workflowId !== command.workflowId || parsed.stepId !== command.stepId) {
      throw new Error("Agent response workflow identity mismatch.");
    }
    if (Date.parse(parsed.completedAt) > Date.parse(command.deadlineAt) && parsed.status === "succeeded") {
      throw new Error("Agent reported success after the command deadline.");
    }
    return { agent: selection.agent, result: parsed };
  }

  async stopAgent(agentId: string, reason: string): Promise<{ agentId: string; reached: boolean; error?: string }> {
    const channel = this.#channels.get(agentId);
    this.#registry.stop(agentId);
    if (!channel) return { agentId, reached: false, error: "No authenticated command channel." };
    try {
      await withDeadline(
        (signal) => channel.stop(reason, signal),
        Math.min(this.#timeoutMs, 10_000),
        undefined,
        `Agent ${agentId} stop timed out.`,
      );
      return { agentId, reached: true };
    } catch (error) {
      return { agentId, reached: false, error: errorMessage(error) };
    } finally {
      this.#channels.delete(agentId);
    }
  }

  async stopAll(reason: string): Promise<Array<{ agentId: string; reached: boolean; error?: string }>> {
    const agentIds = this.#registry.list().map((agent) => agent.agentId).sort();
    return Promise.all(agentIds.map((agentId) => this.stopAgent(agentId, reason)));
  }
}

export function createTransferEnvelope(input: Omit<TransferEnvelope, "transferId" | "createdAt" | "integrityHash">): TransferEnvelope {
  if (input.sourceAgentId === input.destinationAgentId) {
    throw new Error("Cross-agent transfer requires different source and destination agents.");
  }
  const unsigned = {
    transferId: randomUUID(),
    sourceAgentId: input.sourceAgentId,
    destinationAgentId: input.destinationAgentId,
    workflowId: input.workflowId,
    artifactName: input.artifactName,
    classification: input.classification,
    payload: input.payload,
    createdAt: new Date().toISOString(),
  };
  return transferEnvelopeSchema.parse({
    ...unsigned,
    integrityHash: sha256(stableStringify(unsigned)),
  });
}

export function verifyTransferEnvelope(envelope: TransferEnvelope): void {
  const parsed = transferEnvelopeSchema.parse(envelope);
  const { integrityHash, ...unsigned } = parsed;
  if (integrityHash !== sha256(stableStringify(unsigned))) {
    throw new Error("Transferred artifact failed integrity verification.");
  }
}

async function withDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  callerSignal: AbortSignal | undefined,
  timeoutMessage: string,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(timeoutMessage)), timeoutMs);
  const abortFromCaller = () => controller.abort(callerSignal?.reason ?? new Error("Caller cancelled dispatch."));
  if (callerSignal?.aborted) abortFromCaller();
  else callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
  try {
    return await operation(controller.signal);
  } catch (error) {
    if (controller.signal.aborted) throw controller.signal.reason;
    throw error;
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener("abort", abortFromCaller);
  }
}

function stableStringify(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "undefined";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
