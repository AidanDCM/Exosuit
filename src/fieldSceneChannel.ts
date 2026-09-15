import { z } from "zod";
import { observationSchema, uiElementSchema, windowInfoSchema } from "./contracts.js";
import { FieldChannelReplayGuard, fieldChannelEnvelopeSchema, verifyFieldChannelEnvelope, type FieldChannelEnvelope } from "./fieldChannel.js";
import { fieldDisplayContractSchema, fieldRefSchema, type FieldRef } from "./fieldContracts.js";
import { fieldHeartbeatSchema, type FieldHeartbeat } from "./fieldHeartbeat.js";
import { fieldCursorSchema, fieldModalStateSchema, type FieldSceneSnapshot } from "./fieldScene.js";
import { adaptFieldSceneObservation } from "./fieldSceneObservation.js";

const structuralObservationSchema = observationSchema.extend({
  provider: z.literal("windows-ui-automation"),
  windows: z.array(windowInfoSchema).max(1_000),
  elements: z.array(uiElementSchema).max(2_000).default([]),
  screenshotBase64: z.undefined().optional(),
  screenshotMimeType: z.undefined().optional(),
  warnings: z.array(z.literal("UI text and provider warning text were removed before structural Field scene transport.")).max(1),
}).strict().superRefine((observation, context) => {
  for (const [index, window] of observation.windows.entries()) {
    if (window.title !== "") context.addIssue({ code: "custom", path: ["windows", index, "title"], message: "Structural scene transport forbids window-title text." });
  }
  if (observation.activeWindow && observation.activeWindow.title !== "") {
    context.addIssue({ code: "custom", path: ["activeWindow", "title"], message: "Structural scene transport forbids active-window title text." });
  }
  for (const [index, element] of observation.elements.entries()) {
    const expectedName = element.isSensitive ? "[SENSITIVE]" : "";
    if (element.name !== expectedName || element.value !== undefined) {
      context.addIssue({ code: "custom", path: ["elements", index], message: "Structural scene transport forbids element names and values." });
    }
    if (element.isSensitive && (element.automationId !== undefined || element.supportedActions.length > 0)) {
      context.addIssue({ code: "custom", path: ["elements", index], message: "Sensitive scene elements cannot carry automation identity or actions." });
    }
  }
});

export const fieldSceneObservationPayloadSchema = z.object({
  contractVersion: z.literal(1),
  bootId: z.string().uuid(),
  agentId: z.string().min(1).max(200),
  windowsSessionId: z.string().min(1).max(100),
  observation: structuralObservationSchema,
  cursor: fieldCursorSchema,
  modal: fieldModalStateSchema,
}).strict();
export type FieldSceneObservationPayload = z.infer<typeof fieldSceneObservationPayloadSchema>;

export class FieldSceneChannelReceiver {
  readonly #field: FieldRef;
  readonly #display: z.infer<typeof fieldDisplayContractSchema>;
  readonly #agentId: string;
  readonly #windowsSessionId: string;
  readonly #expectedKeyId: string;
  readonly #maximumPayloadBytes: number;
  readonly #replayGuard: FieldChannelReplayGuard;
  #lastCapturedAt?: number;

  constructor(input: {
    field: FieldRef;
    display: z.infer<typeof fieldDisplayContractSchema>;
    agentId: string;
    windowsSessionId: string;
    expectedKeyId: string;
    maximumPayloadBytes?: number;
    replayStateFilePath: string;
  }) {
    this.#field = fieldRefSchema.parse(input.field);
    this.#display = fieldDisplayContractSchema.parse(input.display);
    this.#agentId = z.string().min(1).max(200).parse(input.agentId);
    this.#windowsSessionId = z.string().min(1).max(100).parse(input.windowsSessionId);
    this.#expectedKeyId = z.string().min(1).max(200).parse(input.expectedKeyId);
    this.#maximumPayloadBytes = input.maximumPayloadBytes ?? 12 * 1_024;
    if (!Number.isInteger(this.#maximumPayloadBytes) || this.#maximumPayloadBytes < 1_024 || this.#maximumPayloadBytes > 12 * 1_024) {
      throw new Error("maximumPayloadBytes must be from 1,024 through 12,288.");
    }
    this.#replayGuard = new FieldChannelReplayGuard({
      field: this.#field,
      direction: "guest_to_host",
      expectedKeyId: this.#expectedKeyId,
      stateFilePath: input.replayStateFilePath,
    });
  }

  accept(input: { envelope: FieldChannelEnvelope; heartbeat: FieldHeartbeat; secret: string; now?: Date }): FieldSceneSnapshot {
    const envelope = fieldChannelEnvelopeSchema.parse(input.envelope);
    const now = input.now ?? new Date();
    verifyFieldChannelEnvelope({
      envelope,
      secret: input.secret,
      expectedField: this.#field,
      expectedDirection: "guest_to_host",
      expectedKeyId: this.#expectedKeyId,
      now,
    });
    if (envelope.messageType !== "scene_observation") throw new Error("Field scene receiver accepts only scene_observation messages.");
    if (envelope.sequence < 1) throw new Error("Field scene messages require a positive durable channel sequence.");
    const serializedPayloadBytes = Buffer.byteLength(JSON.stringify(envelope.payload), "utf8");
    if (serializedPayloadBytes > this.#maximumPayloadBytes) throw new Error("Field scene payload exceeds the configured byte bound.");
    const payload = fieldSceneObservationPayloadSchema.parse(envelope.payload);
    const heartbeat = fieldHeartbeatSchema.parse(input.heartbeat);
    if (payload.bootId !== heartbeat.bootId) throw new Error("Field scene boot identity does not match the authenticated heartbeat.");
    if (payload.agentId !== this.#agentId || heartbeat.agentId !== this.#agentId) throw new Error("Field scene agent identity is invalid.");
    if (payload.windowsSessionId !== this.#windowsSessionId) throw new Error("Field scene Windows session identity is invalid.");

    const capturedAt = new Date(payload.observation.capturedAt).getTime();
    if (this.#lastCapturedAt !== undefined && capturedAt < this.#lastCapturedAt) {
      throw new Error("Field scene timestamps cannot move backwards.");
    }
    const candidate = adaptFieldSceneObservation({
      field: this.#field,
      display: this.#display,
      observation: payload.observation,
      heartbeat,
      cursor: payload.cursor,
      modal: payload.modal,
      textPolicy: "structural_only",
      sceneVersion: envelope.sequence,
      now,
    });

    this.#replayGuard.accept({ envelope, secret: input.secret, now });
    this.#lastCapturedAt = capturedAt;
    return structuredClone(candidate);
  }
}
