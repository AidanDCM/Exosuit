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
        "Browser companion observation timed out.",
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
    const result = browserActionResultSchema.parse(
      await withTimeout(
        this.#inner.execute(action),
        this.#timeoutMs,
        "Browser companion action timed out.",
      ),
    );
    if (result.actionId !== action.actionId) {
      throw new Error("Browser companion action identity mismatch.");
    }
    if (result.snapshot) {
      if (
        result.snapshot.tab.browserInstanceId !== action.tab.browserInstanceId ||
        result.snapshot.tab.tabId !== action.tab.tabId ||
        result.snapshot.tab.origin !== action.tab.origin ||
        result.snapshot.tab.generation < action.tab.generation
      ) {
        throw new Error("Browser companion result tab identity mismatch.");
      }
    }
    if (result.status === "succeeded" && result.verificationStatus !== "passed") {
      throw new Error("Browser companion reported success without passed verification.");
    }
    return result;
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
