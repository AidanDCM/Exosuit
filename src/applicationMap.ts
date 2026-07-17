import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import {
  actionTypeSchema,
  uiElementSchema,
  windowInfoSchema,
  type DesktopObservation,
  type UiElement,
  type WindowInfo,
} from "./contracts.js";

export const APPLICATION_MAP_SCHEMA_VERSION = 1;
const MAX_CONTROLS_PER_MAP = 1_000;
const DEFAULT_MAX_VERSIONS_PER_APPLICATION = 20;

export const applicationMapControlSchema = z.object({
  controlKey: z.string().regex(/^[a-f0-9]{64}$/),
  name: z.string().min(1).max(500),
  controlType: z.string().min(1).max(200),
  automationId: z.string().max(500).optional(),
  supportedActions: z.array(actionTypeSchema).max(32),
  relativeBounds: z
    .object({
      x: z.number().min(-1).max(2),
      y: z.number().min(-1).max(2),
      width: z.number().min(0).max(2),
      height: z.number().min(0).max(2),
    })
    .optional(),
});

export const applicationMapSchema = z.object({
  schemaVersion: z.literal(APPLICATION_MAP_SCHEMA_VERSION),
  mapId: z.string().uuid(),
  revision: z.number().int().min(1),
  applicationKey: z.string().min(1).max(120),
  processName: z.string().min(1).max(300),
  windowTitleFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  capturedAt: z.string().datetime(),
  provider: z.string().min(1).max(200),
  sourceObservationId: z.string().min(1).max(300),
  controls: z.array(applicationMapControlSchema).max(MAX_CONTROLS_PER_MAP),
  skippedSensitiveCount: z.number().int().min(0),
  warnings: z.array(z.string().max(2_000)).max(100),
});

export type ApplicationMap = z.infer<typeof applicationMapSchema>;
export type ApplicationMapControl = z.infer<typeof applicationMapControlSchema>;

export const applicationMapSummarySchema = applicationMapSchema.pick({
  schemaVersion: true,
  mapId: true,
  revision: true,
  applicationKey: true,
  processName: true,
  capturedAt: true,
  provider: true,
  skippedSensitiveCount: true,
}).extend({ controlCount: z.number().int().min(0) });

export type ApplicationMapSummary = z.infer<typeof applicationMapSummarySchema>;

export const applicationMapMatchSchema = z.object({
  controlKey: z.string().regex(/^[a-f0-9]{64}$/),
  confidence: z.number().min(0).max(1),
  reasons: z.array(z.string()),
  element: uiElementSchema,
});

export const applicationMapMatchResultSchema = z.object({
  mapId: z.string().uuid(),
  observationId: z.string(),
  window: windowInfoSchema,
  matches: z.array(applicationMapMatchSchema),
  unmatchedControlKeys: z.array(z.string().regex(/^[a-f0-9]{64}$/)),
  warnings: z.array(z.string()),
});

export type ApplicationMapMatchResult = z.infer<typeof applicationMapMatchResultSchema>;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function applicationKey(processName: string): string {
  const normalized = processName.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return (normalized || `application-${sha256(processName).slice(0, 16)}`).slice(0, 120);
}

function relativeBounds(element: UiElement, window: WindowInfo): ApplicationMapControl["relativeBounds"] {
  if (!element.bounds || !window.bounds || window.bounds.width <= 0 || window.bounds.height <= 0) return undefined;
  return {
    x: (element.bounds.x - window.bounds.x) / window.bounds.width,
    y: (element.bounds.y - window.bounds.y) / window.bounds.height,
    width: element.bounds.width / window.bounds.width,
    height: element.bounds.height / window.bounds.height,
  };
}

function controlKey(element: UiElement): string {
  return sha256(
    JSON.stringify({
      name: element.name.trim().toLowerCase(),
      controlType: element.controlType.trim().toLowerCase(),
      automationId: element.automationId?.trim().toLowerCase() ?? "",
      supportedActions: [...element.supportedActions].sort(),
    }),
  );
}

export function buildApplicationMap(input: {
  observation: DesktopObservation;
  window: WindowInfo;
  revision: number;
  capturedAt?: string;
}): ApplicationMap {
  const { observation, window } = input;
  if (input.revision < 1 || !Number.isInteger(input.revision)) throw new Error("Application map revision must be a positive integer.");
  const candidates = observation.elements.filter((element) => element.windowId === window.id);
  const safeElements = candidates.filter((element) => !element.isSensitive).slice(0, MAX_CONTROLS_PER_MAP);
  const skippedSensitiveCount = candidates.filter((element) => element.isSensitive).length;
  const controls = safeElements.map((element) => {
    const bounds = relativeBounds(element, window);
    return applicationMapControlSchema.parse({
      controlKey: controlKey(element),
      name: element.name,
      controlType: element.controlType,
      automationId: element.automationId || undefined,
      supportedActions: [...element.supportedActions].sort(),
      ...(bounds ? { relativeBounds: bounds } : {}),
    });
  });

  const warnings = [...observation.warnings];
  if (skippedSensitiveCount > 0) warnings.push(`${skippedSensitiveCount} sensitive control(s) were excluded from application memory.`);
  if (candidates.length > MAX_CONTROLS_PER_MAP) warnings.push(`Application map was capped at ${MAX_CONTROLS_PER_MAP} controls.`);

  return applicationMapSchema.parse({
    schemaVersion: APPLICATION_MAP_SCHEMA_VERSION,
    mapId: randomUUID(),
    revision: input.revision,
    applicationKey: applicationKey(window.processName),
    processName: window.processName,
    windowTitleFingerprint: sha256(window.title),
    capturedAt: input.capturedAt ?? new Date().toISOString(),
    provider: observation.provider,
    sourceObservationId: observation.observationId,
    controls,
    skippedSensitiveCount,
    warnings,
  });
}

function scoreControl(control: ApplicationMapControl, element: UiElement): { score: number; reasons: string[] } {
  if (element.isSensitive) return { score: 0, reasons: [] };
  let score = 0;
  const reasons: string[] = [];
  if (control.automationId && element.automationId && control.automationId === element.automationId) {
    score += 0.55;
    reasons.push("automation_id_exact");
  }
  if (control.name.localeCompare(element.name, undefined, { sensitivity: "accent" }) === 0) {
    score += 0.3;
    reasons.push("accessible_name_exact");
  }
  if (control.controlType.toLowerCase() === element.controlType.toLowerCase()) {
    score += 0.1;
    reasons.push("control_type_exact");
  }
  const actionOverlap = control.supportedActions.filter((action) => element.supportedActions.includes(action)).length;
  if (control.supportedActions.length > 0 && actionOverlap > 0) {
    score += 0.05 * (actionOverlap / control.supportedActions.length);
    reasons.push("supported_action_overlap");
  }
  return { score: Math.min(1, score), reasons };
}

export function matchApplicationMap(
  map: ApplicationMap,
  observation: DesktopObservation,
  window: WindowInfo,
): ApplicationMapMatchResult {
  const available = observation.elements.filter((element) => element.windowId === window.id && !element.isSensitive);
  const used = new Set<string>();
  const matches: ApplicationMapMatchResult["matches"] = [];
  const unmatchedControlKeys: string[] = [];

  for (const control of map.controls) {
    const candidates = available
      .filter((element) => !used.has(element.id))
      .map((element) => ({ element, ...scoreControl(control, element) }))
      .filter((candidate) => candidate.score >= 0.4)
      .sort((left, right) => right.score - left.score || left.element.id.localeCompare(right.element.id));
    const best = candidates[0];
    if (!best) {
      unmatchedControlKeys.push(control.controlKey);
      continue;
    }
    used.add(best.element.id);
    matches.push({
      controlKey: control.controlKey,
      confidence: best.score,
      reasons: best.reasons,
      element: best.element,
    });
  }

  const warnings = [...observation.warnings];
  if (window.processName.toLowerCase() !== map.processName.toLowerCase()) {
    warnings.push("The fresh window process does not match the stored application map process.");
  }
  if (sha256(window.title) !== map.windowTitleFingerprint) {
    warnings.push("The fresh window title differs from the stored title fingerprint; treat matches as advisory.");
  }
  if (unmatchedControlKeys.length > 0) {
    warnings.push(`${unmatchedControlKeys.length} stored control(s) were not matched in the fresh observation.`);
  }

  return applicationMapMatchResultSchema.parse({
    mapId: map.mapId,
    observationId: observation.observationId,
    window,
    matches,
    unmatchedControlKeys,
    warnings,
  });
}

export class ApplicationMapStore {
  readonly #directory?: string;
  readonly #maxVersionsPerApplication: number;
  readonly #maps = new Map<string, ApplicationMap>();

  constructor(options: { directory?: string; maxVersionsPerApplication?: number } = {}) {
    this.#directory = options.directory;
    this.#maxVersionsPerApplication = options.maxVersionsPerApplication ?? DEFAULT_MAX_VERSIONS_PER_APPLICATION;
    if (!Number.isInteger(this.#maxVersionsPerApplication) || this.#maxVersionsPerApplication < 1 || this.#maxVersionsPerApplication > 100) {
      throw new Error("maxVersionsPerApplication must be an integer from 1 through 100.");
    }
  }

  async hydrate(): Promise<{ loaded: number; skipped: number }> {
    if (!this.#directory) return { loaded: 0, skipped: 0 };
    await mkdir(this.#directory, { recursive: true, mode: 0o700 });
    let loaded = 0;
    let skipped = 0;
    for (const file of await readdir(this.#directory)) {
      if (!file.endsWith(".json")) continue;
      try {
        const map = applicationMapSchema.parse(JSON.parse(await readFile(join(this.#directory, file), "utf8")));
        this.#maps.set(map.mapId, map);
        loaded += 1;
      } catch {
        skipped += 1;
      }
    }
    return { loaded, skipped };
  }

  nextRevision(processName: string): number {
    const key = applicationKey(processName);
    return Math.max(0, ...[...this.#maps.values()].filter((map) => map.applicationKey === key).map((map) => map.revision)) + 1;
  }

  async save(map: ApplicationMap): Promise<ApplicationMap> {
    const parsed = applicationMapSchema.parse(map);
    this.#maps.set(parsed.mapId, parsed);
    if (this.#directory) {
      await mkdir(this.#directory, { recursive: true, mode: 0o700 });
      const target = join(this.#directory, `${parsed.mapId}.json`);
      const temporary = `${target}.${randomUUID()}.tmp`;
      await writeFile(temporary, `${JSON.stringify(parsed, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
      await rename(temporary, target);
    }
    await this.#prune(parsed.applicationKey);
    return parsed;
  }

  get(mapId: string): ApplicationMap | undefined {
    return this.#maps.get(mapId);
  }

  list(): ApplicationMapSummary[] {
    return [...this.#maps.values()]
      .sort((left, right) => right.capturedAt.localeCompare(left.capturedAt))
      .map((map) => ({
        schemaVersion: map.schemaVersion,
        mapId: map.mapId,
        revision: map.revision,
        applicationKey: map.applicationKey,
        processName: map.processName,
        capturedAt: map.capturedAt,
        provider: map.provider,
        skippedSensitiveCount: map.skippedSensitiveCount,
        controlCount: map.controls.length,
      }));
  }

  async #prune(key: string): Promise<void> {
    const versions = [...this.#maps.values()]
      .filter((map) => map.applicationKey === key)
      .sort((left, right) => right.revision - left.revision);
    for (const stale of versions.slice(this.#maxVersionsPerApplication)) {
      this.#maps.delete(stale.mapId);
      if (this.#directory) {
        try {
          await unlink(join(this.#directory, `${stale.mapId}.json`));
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      }
    }
  }
}
