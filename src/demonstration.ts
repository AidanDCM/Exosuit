import { randomUUID } from "node:crypto";
import { z } from "zod";
import { fieldRefSchema, type FieldRef } from "./fieldContracts.js";

export const demonstrationEventSourceSchema = z.enum(["input", "visual", "accessibility", "system", "annotation"]);
export type DemonstrationEventSource = z.infer<typeof demonstrationEventSourceSchema>;

export const demonstrationEventSchema = z.object({
  eventId: z.string().uuid(),
  sequence: z.number().int().nonnegative(),
  occurredAt: z.string().datetime(),
  source: demonstrationEventSourceSchema,
  kind: z.string().min(1).max(200),
  payload: z.record(z.string(), z.unknown()),
});
export type DemonstrationEvent = z.infer<typeof demonstrationEventSchema>;

export const demonstrationEpisodeSchema = z.object({
  contractVersion: z.literal(1),
  episodeId: z.string().uuid(),
  field: fieldRefSchema,
  operatorId: z.string().min(1).max(200),
  goal: z.string().min(1).max(4_000),
  successCriteria: z.array(z.string().min(1).max(1_000)).min(1).max(100),
  consent: z.object({
    granted: z.literal(true),
    grantedAt: z.string().datetime(),
    scope: z.enum(["task", "session"]),
  }),
  status: z.enum(["recording", "completed", "aborted"]),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().optional(),
  events: z.array(demonstrationEventSchema),
  outcome: z
    .object({
      successful: z.boolean(),
      summary: z.string().min(1).max(4_000),
      artifactIds: z.array(z.string().min(1).max(300)).max(1_000),
    })
    .optional(),
});
export type DemonstrationEpisode = z.infer<typeof demonstrationEpisodeSchema>;

const sensitiveKey = /password|passcode|secret|token|cookie|authorization|private.?key|seed.?phrase|recovery.?code|cvv|social.?security/i;

export function redactDemonstrationPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactDemonstrationPayload);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        sensitiveKey.test(key) ? "[REDACTED]" : redactDemonstrationPayload(item),
      ]),
    );
  }
  return value;
}

export class DemonstrationRecorder {
  readonly #maxEvents: number;
  #episode: DemonstrationEpisode;

  constructor(input: {
    field: FieldRef;
    operatorId: string;
    goal: string;
    successCriteria: string[];
    consentGrantedAt: string;
    consentScope?: "task" | "session";
    episodeId?: string;
    startedAt?: string;
    maxEvents?: number;
  }) {
    const maxEvents = input.maxEvents ?? 250_000;
    if (!Number.isInteger(maxEvents) || maxEvents < 1 || maxEvents > 5_000_000) {
      throw new Error("maxEvents must be an integer from 1 through 5,000,000.");
    }
    this.#maxEvents = maxEvents;
    this.#episode = demonstrationEpisodeSchema.parse({
      contractVersion: 1,
      episodeId: input.episodeId ?? randomUUID(),
      field: input.field,
      operatorId: input.operatorId,
      goal: input.goal,
      successCriteria: input.successCriteria,
      consent: {
        granted: true,
        grantedAt: input.consentGrantedAt,
        scope: input.consentScope ?? "task",
      },
      status: "recording",
      startedAt: input.startedAt ?? new Date().toISOString(),
      events: [],
    });
  }

  append(input: {
    source: DemonstrationEventSource;
    kind: string;
    payload: Record<string, unknown>;
    occurredAt?: string;
    eventId?: string;
  }): DemonstrationEvent {
    if (this.#episode.status !== "recording") throw new Error("Only a recording episode can accept events.");
    if (this.#episode.events.length >= this.#maxEvents) throw new Error("Demonstration event limit reached.");
    const event = demonstrationEventSchema.parse({
      eventId: input.eventId ?? randomUUID(),
      sequence: this.#episode.events.length,
      occurredAt: input.occurredAt ?? new Date().toISOString(),
      source: input.source,
      kind: input.kind,
      payload: redactDemonstrationPayload(input.payload),
    });
    const previous = this.#episode.events.at(-1);
    if (previous && new Date(event.occurredAt).getTime() < new Date(previous.occurredAt).getTime()) {
      throw new Error("Demonstration events must be appended in timestamp order.");
    }
    this.#episode = demonstrationEpisodeSchema.parse({ ...this.#episode, events: [...this.#episode.events, event] });
    return event;
  }

  complete(input: { successful: boolean; summary: string; artifactIds?: string[]; endedAt?: string }): DemonstrationEpisode {
    if (this.#episode.status !== "recording") throw new Error("Only a recording episode can be completed.");
    const endedAt = input.endedAt ?? new Date().toISOString();
    if (new Date(endedAt).getTime() < new Date(this.#episode.startedAt).getTime()) {
      throw new Error("Demonstration cannot end before it starts.");
    }
    this.#episode = demonstrationEpisodeSchema.parse({
      ...this.#episode,
      status: "completed",
      endedAt,
      outcome: {
        successful: input.successful,
        summary: input.summary,
        artifactIds: input.artifactIds ?? [],
      },
    });
    return this.snapshot();
  }

  abort(input: { summary: string; endedAt?: string }): DemonstrationEpisode {
    if (this.#episode.status !== "recording") throw new Error("Only a recording episode can be aborted.");
    this.#episode = demonstrationEpisodeSchema.parse({
      ...this.#episode,
      status: "aborted",
      endedAt: input.endedAt ?? new Date().toISOString(),
      outcome: { successful: false, summary: input.summary, artifactIds: [] },
    });
    return this.snapshot();
  }

  snapshot(): DemonstrationEpisode {
    return demonstrationEpisodeSchema.parse(structuredClone(this.#episode));
  }
}

export function summarizeDemonstration(episode: DemonstrationEpisode): {
  eventCount: number;
  bySource: Record<DemonstrationEventSource, number>;
  durationMilliseconds?: number;
} {
  const parsed = demonstrationEpisodeSchema.parse(episode);
  const bySource: Record<DemonstrationEventSource, number> = {
    input: 0,
    visual: 0,
    accessibility: 0,
    system: 0,
    annotation: 0,
  };
  for (const event of parsed.events) bySource[event.source] += 1;
  return {
    eventCount: parsed.events.length,
    bySource,
    ...(parsed.endedAt
      ? { durationMilliseconds: new Date(parsed.endedAt).getTime() - new Date(parsed.startedAt).getTime() }
      : {}),
  };
}
