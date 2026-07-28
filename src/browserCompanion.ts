import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { scanVisibleTextForPromptInjection } from "./safety.js";

export const browserTabIdentitySchema = z.object({
  browserInstanceId: z.string().min(1).max(300),
  tabId: z.string().min(1).max(300),
  generation: z.number().int().positive(),
  origin: z.string().url().refine((value) => new URL(value).origin === value, "origin must not include a path"),
  active: z.boolean(),
  titleFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
});
export type BrowserTabIdentity = z.infer<typeof browserTabIdentitySchema>;

export const browserElementSchema = z.object({
  locatorId: z.string().min(1).max(500),
  tabGeneration: z.number().int().positive(),
  role: z.string().min(1).max(200),
  name: z.string().max(500),
  value: z.string().max(20_000).optional(),
  inputType: z.string().max(100).optional(),
  enabled: z.boolean(),
  visible: z.boolean(),
  sensitive: z.boolean().default(false),
  actions: z.array(z.enum(["click", "set_value", "select", "scroll_into_view"])).max(16),
});
export type BrowserElement = z.infer<typeof browserElementSchema>;

export const browserSnapshotSchema = z.object({
  snapshotId: z.string().uuid(),
  capturedAt: z.string().datetime(),
  tab: browserTabIdentitySchema,
  documentFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  elements: z.array(browserElementSchema).max(5_000),
  warnings: z.array(z.string().max(2_000)).max(100),
});
export type BrowserSnapshot = z.infer<typeof browserSnapshotSchema>;

export const browserActionSchema = z.object({
  actionId: z.string().min(1).max(300),
  tab: browserTabIdentitySchema.pick({
    browserInstanceId: true,
    tabId: true,
    generation: true,
    origin: true,
  }),
  locatorId: z.string().min(1).max(500),
  actionType: z.enum(["click", "set_value", "select", "scroll_into_view"]),
  value: z.string().max(20_000).optional(),
  rationale: z.string().min(1).max(2_000),
});
export type BrowserAction = z.infer<typeof browserActionSchema>;

export const browserActionResultSchema = z.object({
  actionId: z.string().min(1),
  status: z.enum(["succeeded", "blocked", "failed", "disconnected", "uncertain"]),
  verificationStatus: z.enum(["passed", "failed", "not_checked"]),
  summary: z.string(),
  snapshot: browserSnapshotSchema.optional(),
});
export type BrowserActionResult = z.infer<typeof browserActionResultSchema>;

export interface BrowserCompanionProvider {
  observe(tab: Pick<BrowserTabIdentity, "browserInstanceId" | "tabId">): Promise<BrowserSnapshot>;
  execute(action: BrowserAction): Promise<BrowserActionResult>;
}

export class BrowserOriginPermissions {
  readonly #allowed = new Set<string>();

  allow(origin: string): void {
    this.#allowed.add(parseOrigin(origin));
  }

  revoke(origin: string): void {
    this.#allowed.delete(parseOrigin(origin));
  }

  isAllowed(origin: string): boolean {
    return this.#allowed.has(parseOrigin(origin));
  }

  list(): string[] {
    return [...this.#allowed].sort();
  }
}

export class BrowserSnapshotRegistry {
  readonly #snapshots = new Map<string, BrowserSnapshot>();

  update(input: BrowserSnapshot): BrowserSnapshot {
    const snapshot = browserSnapshotSchema.parse(input);
    validateElements(snapshot);
    const key = tabKey(snapshot.tab);
    const prior = this.#snapshots.get(key);
    if (prior) {
      if (snapshot.tab.generation < prior.tab.generation) {
        throw new Error("Browser tab generation moved backwards.");
      }
      const navigationChanged =
        snapshot.documentFingerprint !== prior.documentFingerprint ||
        snapshot.tab.origin !== prior.tab.origin;
      if (navigationChanged && snapshot.tab.generation <= prior.tab.generation) {
        throw new Error("Browser navigation changed without a new tab generation.");
      }
    }
    this.#snapshots.set(key, snapshot);
    return structuredClone(snapshot);
  }

  get(tab: Pick<BrowserTabIdentity, "browserInstanceId" | "tabId">): BrowserSnapshot | undefined {
    const snapshot = this.#snapshots.get(tabKey(tab));
    return snapshot ? structuredClone(snapshot) : undefined;
  }

  requireFresh(action: BrowserAction): { snapshot: BrowserSnapshot; element: BrowserElement } {
    const snapshot = this.#snapshots.get(tabKey(action.tab));
    if (!snapshot) throw new Error("A fresh browser snapshot is required.");
    if (
      snapshot.tab.generation !== action.tab.generation ||
      snapshot.tab.origin !== action.tab.origin
    ) {
      throw new Error("The browser action references a stale tab generation or origin.");
    }
    const element = snapshot.elements.find((candidate) => candidate.locatorId === action.locatorId);
    if (!element || element.tabGeneration !== snapshot.tab.generation) {
      throw new Error("The browser locator is stale or unavailable.");
    }
    return { snapshot, element };
  }
}

export class BrowserSemanticGateway {
  readonly #provider: BrowserCompanionProvider;
  readonly #permissions: BrowserOriginPermissions;
  readonly #registry: BrowserSnapshotRegistry;

  constructor(options: {
    provider: BrowserCompanionProvider;
    permissions?: BrowserOriginPermissions;
    registry?: BrowserSnapshotRegistry;
  }) {
    this.#provider = options.provider;
    this.#permissions = options.permissions ?? new BrowserOriginPermissions();
    this.#registry = options.registry ?? new BrowserSnapshotRegistry();
  }

  permissions(): BrowserOriginPermissions {
    return this.#permissions;
  }

  async observe(tab: Pick<BrowserTabIdentity, "browserInstanceId" | "tabId">): Promise<BrowserSnapshot> {
    const snapshot = this.#registry.update(await this.#provider.observe(tab));
    if (!this.#permissions.isAllowed(snapshot.tab.origin)) {
      throw new Error(`Browser origin ${snapshot.tab.origin} is not locally allowed.`);
    }
    return sanitizeSnapshot(snapshot);
  }

  async execute(input: BrowserAction): Promise<BrowserActionResult> {
    const action = browserActionSchema.parse(input);
    if (!this.#permissions.isAllowed(action.tab.origin)) {
      return blocked(action.actionId, "The browser origin is not locally allowed.");
    }
    let fresh: { snapshot: BrowserSnapshot; element: BrowserElement };
    try {
      fresh = this.#registry.requireFresh(action);
    } catch (error) {
      return blocked(action.actionId, error instanceof Error ? error.message : String(error));
    }
    const { snapshot, element } = fresh;
    if (!element.enabled || !element.visible) {
      return blocked(action.actionId, "The browser target is disabled or not visible.");
    }
    if (element.sensitive || isSensitiveInput(element)) {
      return blocked(action.actionId, "Sensitive and credential-like browser fields are hard denied.");
    }
    if (!element.actions.includes(action.actionType)) {
      return blocked(action.actionId, "The browser target does not support the requested semantic action.");
    }
    if (action.actionType === "set_value" && action.value === undefined) {
      return blocked(action.actionId, "set_value requires an explicit value.");
    }
    const findings = scanVisibleTextForPromptInjection([
      ...snapshot.elements.flatMap((candidate) => [candidate.name, candidate.value ?? ""]),
      ...snapshot.warnings,
    ]);
    if (findings.length > 0 && action.actionType !== "scroll_into_view") {
      return blocked(
        action.actionId,
        "Visible browser content matched prompt-injection warning patterns and requires local review.",
      );
    }
    let result: BrowserActionResult;
    try {
      result = browserActionResultSchema.parse(await this.#provider.execute(action));
    } catch (error) {
      return browserActionResultSchema.parse({
        actionId: action.actionId,
        status: "uncertain",
        verificationStatus: "not_checked",
        summary: `Browser action may have taken effect, but the provider result is unavailable: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
    }
    if (result.status === "succeeded" && result.verificationStatus !== "passed") {
      return browserActionResultSchema.parse({
        actionId: action.actionId,
        status: "uncertain",
        verificationStatus: "not_checked",
        summary: "Browser companion may have acted, but success was not independently verified.",
        ...(result.snapshot ? { snapshot: sanitizeSnapshot(result.snapshot) } : {}),
      });
    }
    if (
      result.snapshot &&
      result.status === "succeeded" &&
      result.verificationStatus === "passed"
    ) {
      this.#registry.update(result.snapshot);
    }
    return {
      ...result,
      ...(result.snapshot ? { snapshot: sanitizeSnapshot(result.snapshot) } : {}),
    };
  }
}

export class MockBrowserCompanion implements BrowserCompanionProvider {
  snapshot: BrowserSnapshot;
  connected = true;

  constructor(snapshot?: BrowserSnapshot) {
    this.snapshot = snapshot ?? createMockBrowserSnapshot();
  }

  async observe(): Promise<BrowserSnapshot> {
    if (!this.connected) throw new Error("Browser companion is disconnected.");
    return structuredClone(this.snapshot);
  }

  async execute(action: BrowserAction): Promise<BrowserActionResult> {
    if (!this.connected) throw new Error("Browser companion is disconnected.");
    const element = this.snapshot.elements.find((candidate) => candidate.locatorId === action.locatorId);
    if (!element) return blocked(action.actionId, "Mock locator was not found.");
    if (action.actionType === "set_value") element.value = action.value;
    const next = browserSnapshotSchema.parse({
      ...this.snapshot,
      snapshotId: randomUUID(),
      capturedAt: new Date().toISOString(),
      documentFingerprint: this.snapshot.documentFingerprint,
    });
    this.snapshot = next;
    return browserActionResultSchema.parse({
      actionId: action.actionId,
      status: "succeeded",
      verificationStatus: "passed",
      summary: "Mock browser semantic action verified.",
      snapshot: next,
    });
  }
}

export function createMockBrowserSnapshot(): BrowserSnapshot {
  return browserSnapshotSchema.parse({
    snapshotId: randomUUID(),
    capturedAt: new Date().toISOString(),
    tab: {
      browserInstanceId: "browser-a",
      tabId: "tab-a",
      generation: 1,
      origin: "https://example.test",
      active: true,
      titleFingerprint: sha256("Example test page"),
    },
    documentFingerprint: sha256("example-document-v1"),
    elements: [
      {
        locatorId: "name-field",
        tabGeneration: 1,
        role: "textbox",
        name: "Name",
        inputType: "text",
        value: "",
        enabled: true,
        visible: true,
        sensitive: false,
        actions: ["set_value", "scroll_into_view"],
      },
      {
        locatorId: "password-field",
        tabGeneration: 1,
        role: "textbox",
        name: "Password",
        inputType: "password",
        enabled: true,
        visible: true,
        sensitive: true,
        actions: ["set_value"],
      },
    ],
    warnings: [],
  });
}

function sanitizeSnapshot(snapshot: BrowserSnapshot): BrowserSnapshot {
  return {
    ...structuredClone(snapshot),
    elements: snapshot.elements
      .filter((element) => !element.sensitive && !isSensitiveInput(element))
      .map((element) => ({ ...element, value: element.value })),
  };
}

function validateElements(snapshot: BrowserSnapshot): void {
  const locators = new Set<string>();
  for (const element of snapshot.elements) {
    if (element.tabGeneration !== snapshot.tab.generation) {
      throw new Error("Browser element generation does not match its tab generation.");
    }
    if (locators.has(element.locatorId)) throw new Error("Browser locator IDs must be unique per snapshot.");
    locators.add(element.locatorId);
  }
}

function isSensitiveInput(element: BrowserElement): boolean {
  return ["password", "hidden"].includes(element.inputType?.toLowerCase() ?? "");
}

function blocked(actionId: string, summary: string): BrowserActionResult {
  return browserActionResultSchema.parse({
    actionId,
    status: "blocked",
    verificationStatus: "not_checked",
    summary,
  });
}

function parseOrigin(value: string): string {
  const url = new URL(value);
  if (url.origin !== value) throw new Error("Browser permissions must use an exact origin without a path.");
  if (!["https:", "http:"].includes(url.protocol)) throw new Error("Unsupported browser origin protocol.");
  return url.origin;
}

function tabKey(tab: Pick<BrowserTabIdentity, "browserInstanceId" | "tabId">): string {
  return `${tab.browserInstanceId}:${tab.tabId}`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
