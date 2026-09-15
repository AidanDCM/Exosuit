import { z } from "zod";
import { uiElementSchema, windowInfoSchema } from "./contracts.js";
import { fieldDisplayContractSchema, fieldRefSchema } from "./fieldContracts.js";

export const fieldCursorSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  visible: z.boolean(),
});
export type FieldCursor = z.infer<typeof fieldCursorSchema>;

export const fieldSystemStateSchema = z.object({
  desktopReady: z.boolean(),
  secureDesktopActive: z.boolean(),
  sessionLocked: z.boolean(),
  inputQueueBusy: z.boolean(),
});
export type FieldSystemState = z.infer<typeof fieldSystemStateSchema>;

export const fieldModalStateSchema = z
  .object({
    present: z.boolean(),
    windowId: z.string().min(1).optional(),
    kind: z.string().min(1).max(200).optional(),
  })
  .superRefine((value, context) => {
    if (value.present && !value.windowId) {
      context.addIssue({ code: "custom", path: ["windowId"], message: "A present modal requires a window ID." });
    }
    if (!value.present && (value.windowId !== undefined || value.kind !== undefined)) {
      context.addIssue({ code: "custom", message: "An absent modal cannot carry window identity or kind." });
    }
  });
export type FieldModalState = z.infer<typeof fieldModalStateSchema>;

export const fieldSceneSnapshotSchema = z.object({
  contractVersion: z.literal(1),
  field: fieldRefSchema,
  sceneVersion: z.number().int().positive(),
  capturedAt: z.string().datetime(),
  display: fieldDisplayContractSchema,
  observationId: z.string().min(1).max(300),
  activeWindowId: z.string().min(1).optional(),
  windows: z.array(windowInfoSchema).max(1_000),
  elements: z.array(uiElementSchema).max(10_000),
  cursor: fieldCursorSchema,
  modal: fieldModalStateSchema,
  system: fieldSystemStateSchema,
  warnings: z.array(z.string().max(2_000)).max(1_000),
});
export type FieldSceneSnapshot = z.infer<typeof fieldSceneSnapshotSchema>;

export const fieldSceneEventSchema = z.object({
  eventType: z.enum([
    "scene_initialized",
    "window_appeared",
    "window_disappeared",
    "active_window_changed",
    "modal_changed",
    "system_state_changed",
    "display_changed",
    "elements_changed",
  ]),
  field: fieldRefSchema,
  sceneVersion: z.number().int().positive(),
  occurredAt: z.string().datetime(),
  payload: z.record(z.string(), z.unknown()),
});
export type FieldSceneEvent = z.infer<typeof fieldSceneEventSchema>;

export class FieldSceneGraph {
  readonly #field: z.infer<typeof fieldRefSchema>;
  #current?: FieldSceneSnapshot;

  constructor(field: z.infer<typeof fieldRefSchema>) {
    this.#field = fieldRefSchema.parse(field);
  }

  update(input: FieldSceneSnapshot): FieldSceneEvent[] {
    const next = validateScene(fieldSceneSnapshotSchema.parse(input));
    if (next.field.fieldId !== this.#field.fieldId || next.field.fieldGeneration !== this.#field.fieldGeneration) {
      throw new Error("Scene snapshot cannot cross Field generations.");
    }
    if (this.#current) {
      if (next.sceneVersion <= this.#current.sceneVersion) throw new Error("Scene versions must increase.");
      if (new Date(next.capturedAt).getTime() < new Date(this.#current.capturedAt).getTime()) {
        throw new Error("Scene timestamps cannot move backwards.");
      }
    }

    const events = this.#diff(this.#current, next);
    this.#current = structuredClone(next);
    return events;
  }

  snapshot(): FieldSceneSnapshot | undefined {
    return this.#current ? structuredClone(this.#current) : undefined;
  }

  assertReadyForInput(): FieldSceneSnapshot {
    if (!this.#current) throw new Error("No Field scene has been observed.");
    if (!this.#current.system.desktopReady) throw new Error("Field desktop is not ready.");
    if (this.#current.system.secureDesktopActive) throw new Error("Secure desktop blocks Field input.");
    if (this.#current.system.sessionLocked) throw new Error("Locked Field session blocks input.");
    if (this.#current.system.inputQueueBusy) throw new Error("Field input queue is already busy.");
    return structuredClone(this.#current);
  }

  #diff(previous: FieldSceneSnapshot | undefined, next: FieldSceneSnapshot): FieldSceneEvent[] {
    if (!previous) return [event("scene_initialized", next, { windowCount: next.windows.length, elementCount: next.elements.length })];
    const events: FieldSceneEvent[] = [];
    const previousWindows = new Map(previous.windows.map((window) => [window.id, window]));
    const nextWindows = new Map(next.windows.map((window) => [window.id, window]));
    for (const windowId of [...nextWindows.keys()].filter((id) => !previousWindows.has(id)).sort()) {
      events.push(event("window_appeared", next, { windowId }));
    }
    for (const windowId of [...previousWindows.keys()].filter((id) => !nextWindows.has(id)).sort()) {
      events.push(event("window_disappeared", next, { windowId }));
    }
    if (previous.activeWindowId !== next.activeWindowId) {
      events.push(event("active_window_changed", next, compact({ from: previous.activeWindowId, to: next.activeWindowId })));
    }
    if (JSON.stringify(previous.modal) !== JSON.stringify(next.modal)) {
      events.push(event("modal_changed", next, { from: previous.modal, to: next.modal }));
    }
    if (JSON.stringify(previous.system) !== JSON.stringify(next.system)) {
      events.push(event("system_state_changed", next, { from: previous.system, to: next.system }));
    }
    if (JSON.stringify(previous.display) !== JSON.stringify(next.display)) {
      events.push(event("display_changed", next, { from: previous.display, to: next.display }));
    }
    if (elementFingerprint(previous) !== elementFingerprint(next)) {
      events.push(event("elements_changed", next, { fromCount: previous.elements.length, toCount: next.elements.length }));
    }
    return events;
  }
}

function validateScene(scene: FieldSceneSnapshot): FieldSceneSnapshot {
  const windows = new Set(scene.windows.map((window) => window.id));
  if (windows.size !== scene.windows.length) throw new Error("Field scene window IDs must be unique.");
  if (scene.activeWindowId && !windows.has(scene.activeWindowId)) {
    throw new Error("Active window must exist in the Field scene window registry.");
  }
  const activeWindows = scene.windows.filter((window) => window.isActive);
  if (activeWindows.length > 1) throw new Error("Field scene may contain only one active window.");
  if (scene.activeWindowId && (activeWindows.length !== 1 || activeWindows[0]!.id !== scene.activeWindowId)) {
    throw new Error("Active window identity must match the window marked active.");
  }
  if (!scene.activeWindowId && activeWindows.length > 0) {
    throw new Error("A window marked active requires activeWindowId.");
  }

  const elementIds = new Set<string>();
  for (const element of scene.elements) {
    if (elementIds.has(element.id)) throw new Error("Field scene element IDs must be unique.");
    elementIds.add(element.id);
    if (!windows.has(element.windowId)) throw new Error("Every Field scene element must belong to a listed window.");
    if (element.isSensitive && (element.value !== undefined || element.automationId !== undefined || element.supportedActions.length > 0)) {
      throw new Error("Sensitive Field scene elements cannot expose values, automation identity, or actions.");
    }
  }
  if (scene.modal.present && !windows.has(scene.modal.windowId!)) {
    throw new Error("Modal window must exist in the Field scene window registry.");
  }
  if (
    scene.cursor.x < 0 ||
    scene.cursor.y < 0 ||
    scene.cursor.x >= scene.display.width ||
    scene.cursor.y >= scene.display.height
  ) {
    throw new Error("Field cursor must remain inside the display contract.");
  }
  if ((scene.system.secureDesktopActive || scene.system.sessionLocked) && scene.system.desktopReady) {
    throw new Error("A secure or locked Field session cannot report the desktop ready.");
  }
  return scene;
}

function event(
  eventType: FieldSceneEvent["eventType"],
  scene: FieldSceneSnapshot,
  payload: Record<string, unknown>,
): FieldSceneEvent {
  return fieldSceneEventSchema.parse({
    eventType,
    field: scene.field,
    sceneVersion: scene.sceneVersion,
    occurredAt: scene.capturedAt,
    payload,
  });
}

function elementFingerprint(scene: FieldSceneSnapshot): string {
  return JSON.stringify(
    scene.elements.map((element) => ({
      id: element.id,
      windowId: element.windowId,
      name: element.name,
      controlType: element.controlType,
      enabled: element.enabled,
      focused: element.focused,
      offscreen: element.offscreen,
      bounds: element.bounds,
    })),
  );
}

function compact(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}
