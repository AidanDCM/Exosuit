import { z } from "zod";
import { observationSchema, type DesktopObservation, type UiElement, type WindowInfo } from "./contracts.js";
import { fieldDisplayContractSchema, fieldRefSchema, type FieldRef } from "./fieldContracts.js";
import { fieldHeartbeatSchema, type FieldHeartbeat } from "./fieldHeartbeat.js";
import {
  fieldCursorSchema,
  fieldModalStateSchema,
  fieldSceneSnapshotSchema,
  type FieldCursor,
  type FieldModalState,
  type FieldSceneSnapshot,
} from "./fieldScene.js";

export const fieldSceneTextPolicySchema = z.enum(["structural_only", "consented_ui_text"]);
export type FieldSceneTextPolicy = z.infer<typeof fieldSceneTextPolicySchema>;

export function adaptFieldSceneObservation(input: {
  field: FieldRef;
  display: z.infer<typeof fieldDisplayContractSchema>;
  observation: DesktopObservation;
  heartbeat: FieldHeartbeat;
  cursor: FieldCursor;
  modal?: FieldModalState;
  textPolicy?: FieldSceneTextPolicy;
  maximumHeartbeatAgeMs?: number;
  sceneVersion: number;
  now?: Date;
}): FieldSceneSnapshot {
  const field = fieldRefSchema.parse(input.field);
  const display = fieldDisplayContractSchema.parse(input.display);
  const textPolicy = fieldSceneTextPolicySchema.parse(input.textPolicy ?? "structural_only");
  const maximumHeartbeatAgeMs = input.maximumHeartbeatAgeMs ?? 5_000;
  if (!Number.isInteger(maximumHeartbeatAgeMs) || maximumHeartbeatAgeMs < 100 || maximumHeartbeatAgeMs > 60_000) {
    throw new Error("maximumHeartbeatAgeMs must be from 100 through 60,000.");
  }
  if (!Number.isInteger(input.sceneVersion) || input.sceneVersion < 1) {
    throw new Error("sceneVersion must be a positive integer.");
  }
  const observation = observationSchema.parse(structuredClone(input.observation));
  const heartbeat = fieldHeartbeatSchema.parse(structuredClone(input.heartbeat));
  const cursor = fieldCursorSchema.parse(input.cursor);
  const modal = fieldModalStateSchema.parse(input.modal ?? { present: false });
  if (heartbeat.field.fieldId !== field.fieldId || heartbeat.field.fieldGeneration !== field.fieldGeneration) {
    throw new Error("Scene observation heartbeat cannot cross Field generations.");
  }
  const now = input.now ?? new Date();
  const heartbeatAgeMs = now.getTime() - new Date(heartbeat.observedAt).getTime();
  if (heartbeatAgeMs < -2_000 || heartbeatAgeMs > maximumHeartbeatAgeMs) {
    throw new Error("Scene observation requires a fresh authenticated heartbeat.");
  }
  const observationAgeMs = now.getTime() - new Date(observation.capturedAt).getTime();
  if (observationAgeMs < -2_000 || observationAgeMs > maximumHeartbeatAgeMs) {
    throw new Error("Scene observation is stale or too far in the future.");
  }
  if (observation.screenshotBase64 !== undefined || observation.screenshotMimeType !== undefined) {
    throw new Error("Field scene observation never accepts screenshot bytes.");
  }

  const windows = observation.windows.map((window) => sanitizeWindow(window, textPolicy));
  const elements = observation.elements.map((element) => sanitizeElement(element, textPolicy));
  const activeWindowId = observation.activeWindow?.id;
  const warnings = [...observation.warnings];
  if (textPolicy === "structural_only") warnings.push("UI text was removed by the structural-only Field scene policy.");
  return fieldSceneSnapshotSchema.parse({
    contractVersion: 1,
    field,
    sceneVersion: input.sceneVersion,
    capturedAt: observation.capturedAt,
    display,
    observationId: observation.observationId,
    ...(activeWindowId ? { activeWindowId } : {}),
    windows,
    elements,
    cursor,
    modal,
    system: {
      desktopReady: heartbeat.desktopReady,
      secureDesktopActive: heartbeat.secureDesktopActive,
      sessionLocked: heartbeat.sessionLocked,
      inputQueueBusy: heartbeat.inputQueueDepth > 0 || heartbeat.pendingCommandCount > 0,
    },
    warnings,
  });
}

export class FieldSceneObservationAdapter {
  readonly #field: FieldRef;
  readonly #display: z.infer<typeof fieldDisplayContractSchema>;
  readonly #textPolicy: FieldSceneTextPolicy;
  readonly #maximumHeartbeatAgeMs: number;
  #sceneVersion = 0;

  constructor(options: {
    field: FieldRef;
    display: z.infer<typeof fieldDisplayContractSchema>;
    textPolicy?: FieldSceneTextPolicy;
    maximumHeartbeatAgeMs?: number;
  }) {
    this.#field = fieldRefSchema.parse(options.field);
    this.#display = fieldDisplayContractSchema.parse(options.display);
    this.#textPolicy = fieldSceneTextPolicySchema.parse(options.textPolicy ?? "structural_only");
    this.#maximumHeartbeatAgeMs = options.maximumHeartbeatAgeMs ?? 5_000;
    if (!Number.isInteger(this.#maximumHeartbeatAgeMs) || this.#maximumHeartbeatAgeMs < 100 || this.#maximumHeartbeatAgeMs > 60_000) {
      throw new Error("maximumHeartbeatAgeMs must be from 100 through 60,000.");
    }
  }

  adapt(input: {
    observation: DesktopObservation;
    heartbeat: FieldHeartbeat;
    cursor: FieldCursor;
    modal?: FieldModalState;
    now?: Date;
  }): FieldSceneSnapshot {
    const nextVersion = this.#sceneVersion + 1;
    const scene = adaptFieldSceneObservation({
      field: this.#field,
      display: this.#display,
      observation: input.observation,
      heartbeat: input.heartbeat,
      cursor: input.cursor,
      modal: input.modal,
      textPolicy: this.#textPolicy,
      maximumHeartbeatAgeMs: this.#maximumHeartbeatAgeMs,
      sceneVersion: nextVersion,
      now: input.now,
    });
    this.#sceneVersion = nextVersion;
    return scene;
  }
}

function sanitizeWindow(window: WindowInfo, textPolicy: FieldSceneTextPolicy): WindowInfo {
  return {
    ...structuredClone(window),
    title: textPolicy === "consented_ui_text" ? window.title : "",
  };
}

function sanitizeElement(element: UiElement, textPolicy: FieldSceneTextPolicy): UiElement {
  if (element.isSensitive) {
    return {
      ...structuredClone(element),
      name: "[SENSITIVE]",
      automationId: undefined,
      value: undefined,
      supportedActions: [],
    };
  }
  if (textPolicy === "structural_only") {
    return {
      ...structuredClone(element),
      name: "",
      value: undefined,
    };
  }
  return structuredClone(element);
}
