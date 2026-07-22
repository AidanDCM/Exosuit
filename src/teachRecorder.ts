import { z } from "zod";
import {
  DemonstrationRecorder,
  demonstrationEventSourceSchema,
  type DemonstrationEpisode,
  type DemonstrationEvent,
  type DemonstrationEventSource,
} from "./demonstration.js";
import { fieldRefSchema, type FieldRef } from "./fieldContracts.js";

export const teachRecorderStateSchema = z.enum(["armed", "recording", "paused", "completed", "aborted", "faulted"]);
export type TeachRecorderState = z.infer<typeof teachRecorderStateSchema>;

export const teachRecorderSourceSchema = demonstrationEventSourceSchema;
export type TeachRecorderSource = DemonstrationEventSource;

export interface TeachRecorderStatus {
  state: TeachRecorderState;
  field: FieldRef;
  recordingIndicatorVisible: boolean;
  inputInjectionAllowed: false;
  enabledSources: TeachRecorderSource[];
  eventCount: number;
  faultReason?: string;
}

export class TeachRecorderSession {
  readonly #field: FieldRef;
  readonly #operatorId: string;
  readonly #goal: string;
  readonly #successCriteria: string[];
  readonly #consentGrantedAt: string;
  readonly #consentScope: "task" | "session";
  readonly #enabledSources: Set<TeachRecorderSource>;
  readonly #maxEvents: number;
  #state: TeachRecorderState = "armed";
  #recorder?: DemonstrationRecorder;
  #episode?: DemonstrationEpisode;
  #faultReason?: string;

  constructor(input: {
    field: FieldRef;
    operatorId: string;
    goal: string;
    successCriteria: string[];
    consentGrantedAt: string;
    consentScope?: "task" | "session";
    enabledSources?: TeachRecorderSource[];
    maxEvents?: number;
  }) {
    this.#field = fieldRefSchema.parse(input.field);
    if (!input.operatorId.trim()) throw new Error("Teach recorder operator identity is required.");
    if (!input.goal.trim()) throw new Error("Teach recorder goal is required.");
    if (input.successCriteria.length < 1) throw new Error("Teach recorder requires success criteria.");
    if (Number.isNaN(new Date(input.consentGrantedAt).getTime())) throw new Error("Teach recorder consent timestamp is invalid.");
    this.#operatorId = input.operatorId;
    this.#goal = input.goal;
    this.#successCriteria = [...input.successCriteria];
    this.#consentGrantedAt = input.consentGrantedAt;
    this.#consentScope = input.consentScope ?? "task";
    const sources = input.enabledSources ?? [...teachRecorderSourceSchema.options];
    if (sources.length < 1 || new Set(sources).size !== sources.length) throw new Error("Teach recorder sources must be unique and non-empty.");
    this.#enabledSources = new Set(sources.map((source) => teachRecorderSourceSchema.parse(source)));
    this.#maxEvents = input.maxEvents ?? 250_000;
    if (!Number.isInteger(this.#maxEvents) || this.#maxEvents < 1 || this.#maxEvents > 5_000_000) {
      throw new Error("Teach recorder maxEvents must be from 1 through 5,000,000.");
    }
  }

  start(startedAt = new Date().toISOString()): TeachRecorderStatus {
    if (this.#state !== "armed") throw new Error("Only an armed Teach recorder can start.");
    if (new Date(this.#consentGrantedAt).getTime() > new Date(startedAt).getTime()) {
      throw new Error("Teach recorder cannot start before consent is granted.");
    }
    this.#recorder = new DemonstrationRecorder({
      field: this.#field,
      operatorId: this.#operatorId,
      goal: this.#goal,
      successCriteria: this.#successCriteria,
      consentGrantedAt: this.#consentGrantedAt,
      consentScope: this.#consentScope,
      startedAt,
      maxEvents: this.#maxEvents,
    });
    this.#state = "recording";
    return this.status();
  }

  append(input: {
    source: TeachRecorderSource;
    kind: string;
    payload: Record<string, unknown>;
    occurredAt?: string;
  }): DemonstrationEvent {
    if (this.#state !== "recording" || !this.#recorder) throw new Error("Teach recorder accepts events only while recording.");
    if (!this.#enabledSources.has(input.source)) throw new Error(`Teach recorder source ${input.source} is not enabled.`);
    return this.#recorder.append(input);
  }

  pause(): TeachRecorderStatus {
    if (this.#state !== "recording") throw new Error("Only a recording Teach session can pause.");
    this.#state = "paused";
    return this.status();
  }

  resume(): TeachRecorderStatus {
    if (this.#state !== "paused") throw new Error("Only a paused Teach session can resume.");
    this.#state = "recording";
    return this.status();
  }

  complete(input: { successful: boolean; summary: string; artifactIds?: string[]; endedAt?: string }): DemonstrationEpisode {
    if ((this.#state !== "recording" && this.#state !== "paused") || !this.#recorder) {
      throw new Error("Only an active Teach session can complete.");
    }
    this.#episode = this.#recorder.complete(input);
    this.#state = "completed";
    return structuredClone(this.#episode);
  }

  abort(input: { summary: string; endedAt?: string }): DemonstrationEpisode {
    if ((this.#state !== "recording" && this.#state !== "paused") || !this.#recorder) {
      throw new Error("Only an active Teach session can abort.");
    }
    this.#episode = this.#recorder.abort(input);
    this.#state = "aborted";
    return structuredClone(this.#episode);
  }

  fault(reason: string, endedAt = new Date().toISOString()): DemonstrationEpisode | undefined {
    if (!reason.trim()) throw new Error("Teach recorder fault requires a reason.");
    if (["completed", "aborted", "faulted"].includes(this.#state)) throw new Error("Terminal Teach recorder state cannot fault again.");
    this.#faultReason = reason;
    if (this.#recorder && (this.#state === "recording" || this.#state === "paused")) {
      this.#episode = this.#recorder.abort({ summary: `Recorder fault: ${reason}`, endedAt });
    }
    this.#state = "faulted";
    return this.#episode ? structuredClone(this.#episode) : undefined;
  }

  status(): TeachRecorderStatus {
    return {
      state: this.#state,
      field: structuredClone(this.#field),
      recordingIndicatorVisible: this.#state === "recording" || this.#state === "paused",
      inputInjectionAllowed: false,
      enabledSources: [...this.#enabledSources].sort(),
      eventCount: this.#recorder?.snapshot().events.length ?? 0,
      ...(this.#faultReason ? { faultReason: this.#faultReason } : {}),
    };
  }

  episode(): DemonstrationEpisode | undefined {
    if (this.#episode) return structuredClone(this.#episode);
    return this.#recorder?.snapshot();
  }
}
