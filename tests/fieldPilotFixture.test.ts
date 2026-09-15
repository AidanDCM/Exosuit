import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Field synthetic acceptance application", () => {
  it("contains deterministic accessibility and failure-injection controls without network code", async () => {
    const html = await readFile("tests/fixtures/field-pilot-fixture.html", "utf8");
    for (const id of [
      "query",
      "search",
      "results",
      "enable-later",
      "delayed-action",
      "open-modal",
      "confirm-modal",
      "cancel-modal",
      "no-effect-timeout",
      "uncertain-effect",
      "download",
      "fixture-password",
      "status",
    ]) {
      expect(html).toContain(`id="${id}"`);
    }
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('type="password"');
    expect(html).toContain("failure:transient-no-effect");
    expect(html).toContain("failure:possible-unverified-effect");
    expect(html).toContain("field-fixture-output.json");
    expect(html).not.toMatch(/fetch\s*\(|XMLHttpRequest|WebSocket|https?:\/\//i);
  });
});
