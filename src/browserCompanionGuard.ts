import {
  browserActionResultSchema,
  browserSnapshotSchema,
  type BrowserAction,
  type BrowserActionResult,
  type BrowserCompanionProvider,
  type BrowserSnapshot,
  type BrowserTabIdentity,
} from "./browserCompanion.js";

export class GuardedBrowserCompanionProvider implements BrowserCompanionProvider {
  readonly #inner: BrowserCompanionProvider;
  readonly #timeoutMs: number;

  constructor(options: { provider: BrowserCompanionProvider; timeoutMs?: number }) {
    this.#inner = options.provider;
    this.#timeoutMs = options.timeoutMs ?? 15_000;
    if (!Number.isInteger(this.#timeoutMs) || this.#timeoutMs < 100 || this.#timeoutMs > 300_000) {
      throw new Error("Browser companion timeout must be between 100 and 300000 milliseconds.");
    }
  }

  async observe(
    tab: Pick<BrowserTabIdentity, "browserInstanceId" | "tabId">,
  ): Promise<BrowserSnapshot> {
    const snapshot = browserSnapshotSchema.parse(
      await withTimeout(
        this.#inner.observe(tab),
        this.#timeoutMs,
        new Error("Browser companion observation timed out."),
      ),
    );
    if (
      snapshot.tab.browserInstanceId !== tab.browserInstanceId ||
      snapshot.tab.tabId !== tab.tabId
    ) {
      throw new Error("Browser companion observation identity mismatch.");
    }
    return snapshot;
  }

  async execute(action: BrowserAction): Promise<BrowserActionResult> {
    let result: BrowserActionResult;
    try {
      result = browserActionResultSchema.parse(await withTimeout(
        this.#inner.execute(action),
        this.#timeoutMs,
        new BrowserCompanionTimeoutError("Browser companion action timed out."),
      ));
    } catch (error) {
      if (error instanceof BrowserCompanionTimeoutError) {
        return uncertain(action.actionId, error.message);
      }
      throw error;
    }
    if (result.actionId !== action.actionId) {
      throw new Error("Browser companion action identity mismatch.");
    }
    if (result.snapshot) {
      if (
        result.snapshot.tab.browserInstanceId !== action.tab.browserInstanceId ||
        result.snapshot.tab.tabId !== action.tab.tabId ||
        result.snapshot.tab.origin !== action.tab.origin
      ) {
        throw new Error("Browser companion result tab identity mismatch.");
      }
      if (result.snapshot.tab.generation !== action.tab.generation) {
        return uncertain(
          action.actionId,
          "Browser action may have taken effect, but the tab generation changed before verification.",
          result.snapshot,
        );
      }
    }
    if (result.status === "succeeded" && result.verificationStatus !== "passed") {
      return uncertain(
        action.actionId,
        "Browser companion may have acted, but success was not independently verified.",
        result.snapshot,
      );
    }
    return result;
  }
}

class BrowserCompanionTimeoutError extends Error {}

function uncertain(actionId: string, summary: string, snapshot?: BrowserSnapshot): BrowserActionResult {
  return browserActionResultSchema.parse({
    actionId,
    status: "uncertain",
    verificationStatus: "not_checked",
    summary,
    ...(snapshot ? { snapshot } : {}),
  });
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, error: Error): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(error), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
