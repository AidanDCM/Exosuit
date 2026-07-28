import { describe, expect, it } from "vitest";
import {
  createMockBrowserSnapshot,
  type BrowserAction,
  type BrowserActionResult,
  type BrowserCompanionProvider,
  type BrowserSnapshot,
  type BrowserTabIdentity,
} from "../src/browserCompanion.js";
import { GuardedBrowserCompanionProvider } from "../src/browserCompanionGuard.js";

class FixtureProvider implements BrowserCompanionProvider {
  constructor(
    readonly mode: "success" | "hang" | "wrong-observation" | "wrong-action" | "wrong-tab" | "unverified" = "success",
  ) {}

  async observe(
    tab: Pick<BrowserTabIdentity, "browserInstanceId" | "tabId">,
  ): Promise<BrowserSnapshot> {
    if (this.mode === "hang") return new Promise<BrowserSnapshot>(() => undefined);
    const snapshot = createMockBrowserSnapshot();
    return {
      ...snapshot,
      tab: {
        ...snapshot.tab,
        browserInstanceId: this.mode === "wrong-observation" ? "other-browser" : tab.browserInstanceId,
        tabId: tab.tabId,
      },
    };
  }

  async execute(action: BrowserAction): Promise<BrowserActionResult> {
    if (this.mode === "hang") return new Promise<BrowserActionResult>(() => undefined);
    const snapshot = createMockBrowserSnapshot();
    return {
      actionId: this.mode === "wrong-action" ? "another-action" : action.actionId,
      status: "succeeded",
      verificationStatus: this.mode === "unverified" ? "not_checked" : "passed",
      summary: "Fixture result.",
      snapshot: {
        ...snapshot,
        tab: {
          ...snapshot.tab,
          browserInstanceId:
            this.mode === "wrong-tab" ? "other-browser" : action.tab.browserInstanceId,
          tabId: action.tab.tabId,
          generation: action.tab.generation,
          origin: action.tab.origin,
        },
      },
    };
  }
}

function action(): BrowserAction {
  return {
    actionId: "action-a",
    tab: {
      browserInstanceId: "browser-a",
      tabId: "tab-a",
      generation: 1,
      origin: "https://example.test",
    },
    locatorId: "name-field",
    actionType: "set_value",
    value: "Aidan",
    rationale: "Fill a disposable test field.",
  };
}

describe("guarded browser companion provider", () => {
  it("passes through a matching verified result", async () => {
    const provider = new GuardedBrowserCompanionProvider({ provider: new FixtureProvider() });
    const snapshot = await provider.observe({ browserInstanceId: "browser-a", tabId: "tab-a" });
    expect(snapshot.tab.browserInstanceId).toBe("browser-a");
    expect(await provider.execute(action())).toMatchObject({
      actionId: "action-a",
      status: "succeeded",
      verificationStatus: "passed",
    });
  });

  it("rejects observation, action, and tab identity mismatches", async () => {
    await expect(
      new GuardedBrowserCompanionProvider({ provider: new FixtureProvider("wrong-observation") }).observe({
        browserInstanceId: "browser-a",
        tabId: "tab-a",
      }),
    ).rejects.toThrow(/observation identity mismatch/);
    await expect(
      new GuardedBrowserCompanionProvider({ provider: new FixtureProvider("wrong-action") }).execute(action()),
    ).rejects.toThrow(/action identity mismatch/);
    await expect(
      new GuardedBrowserCompanionProvider({ provider: new FixtureProvider("wrong-tab") }).execute(action()),
    ).rejects.toThrow(/result tab identity mismatch/);
  });

  it("rejects unverified success and bounds hung operations", async () => {
    await expect(
      new GuardedBrowserCompanionProvider({ provider: new FixtureProvider("unverified") }).execute(action()),
    ).rejects.toThrow(/without passed verification/);
    const hung = new GuardedBrowserCompanionProvider({
      provider: new FixtureProvider("hang"),
      timeoutMs: 100,
    });
    await expect(hung.observe({ browserInstanceId: "browser-a", tabId: "tab-a" })).rejects.toThrow(
      /observation timed out/,
    );
    await expect(hung.execute(action())).rejects.toThrow(/action timed out/);
  });
});
