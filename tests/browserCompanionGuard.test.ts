import { describe, expect, it } from "vitest";
import {
  BrowserOriginPermissions,
  BrowserSemanticGateway,
  BrowserSnapshotRegistry,
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
    readonly mode:
      | "success"
      | "hang"
      | "wrong-observation"
      | "wrong-action"
      | "wrong-tab"
      | "navigated"
      | "unverified" = "success",
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
    const base = createMockBrowserSnapshot();
    const generation = this.mode === "navigated" ? action.tab.generation + 1 : action.tab.generation;
    const snapshot = {
      ...base,
      elements: base.elements.map((element) => ({ ...element, tabGeneration: generation })),
    };
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
          generation,
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

  it("marks unverified success, navigation, and action timeout uncertain", async () => {
    await expect(
      new GuardedBrowserCompanionProvider({ provider: new FixtureProvider("unverified") }).execute(action()),
    ).resolves.toMatchObject({ status: "uncertain", verificationStatus: "not_checked" });
    await expect(
      new GuardedBrowserCompanionProvider({ provider: new FixtureProvider("navigated") }).execute(action()),
    ).resolves.toMatchObject({
      status: "uncertain",
      verificationStatus: "not_checked",
      summary: expect.stringMatching(/tab generation changed/),
    });
    const hung = new GuardedBrowserCompanionProvider({
      provider: new FixtureProvider("hang"),
      timeoutMs: 100,
    });
    await expect(hung.observe({ browserInstanceId: "browser-a", tabId: "tab-a" })).rejects.toThrow(
      /observation timed out/,
    );
    await expect(hung.execute(action())).resolves.toMatchObject({
      status: "uncertain",
      verificationStatus: "not_checked",
      summary: expect.stringMatching(/action timed out/),
    });
  });

  it("does not promote an uncertain navigated snapshot into fresh action state", async () => {
    const registry = new BrowserSnapshotRegistry();
    const permissions = new BrowserOriginPermissions();
    permissions.allow("https://example.test");
    const guarded = new GuardedBrowserCompanionProvider({
      provider: new FixtureProvider("navigated"),
    });
    const gateway = new BrowserSemanticGateway({ provider: guarded, permissions, registry });
    const observed = await gateway.observe({ browserInstanceId: "browser-a", tabId: "tab-a" });
    expect(await gateway.execute(action())).toMatchObject({ status: "uncertain" });
    expect(registry.get(observed.tab)?.tab.generation).toBe(1);
  });
});
