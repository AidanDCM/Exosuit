import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { fieldChannelEnvelopeSchema, verifyFieldChannelEnvelope } from "../src/fieldChannel.js";
import {
  fieldBootstrapCheckNameSchema,
  fieldBootstrapReportSchema,
} from "../src/fieldBootstrap.js";

/**
 * The bootstrap status the host evaluates readiness from.
 *
 * The mandatory check list exists **twice** — a C# array in `FieldKvpRuntime` and the Zod enum in
 * `src/fieldBootstrap.ts` — maintained by hand in two languages. Drift there is quiet: the guest
 * would report `ready` while the host still requires a check the guest never runs, or the host
 * would reject a name the guest emits. Neither fails loudly, and neither is visible without
 * comparing the two lists directly.
 *
 * The fixture is generated from `ReadBootstrapStatus` and `BindBootstrapToBoot`, the exact
 * functions the guest publishes from, across all three readiness outcomes.
 */

interface FixtureCase {
  readonly description: string;
  readonly envelope: unknown;
}

interface Fixture {
  readonly secret: string;
  readonly expectedKeyId: string;
  readonly verifyAt: string;
  readonly bootId: string;
  readonly mandatoryChecks: readonly string[];
  readonly cases: readonly FixtureCase[];
}

const fixture = JSON.parse(readFileSync("tests/fixtures/field-bootstrap-v1.json", "utf8")) as Fixture;

const byDescription = (description: string) => {
  const found = fixture.cases.find((testCase) => testCase.description === description);
  expect(found, `fixture must contain the "${description}" case`).toBeDefined();
  return found!;
};

const payloadOf = (testCase: FixtureCase) =>
  (testCase.envelope as { payload: Record<string, unknown> }).payload;

describe("Field bootstrap cross-language fixture", () => {
  it("the guest's mandatory check list matches the host's, exactly and in order", () => {
    // The assertion this whole fixture exists for. Two hand-maintained lists in two languages,
    // compared directly rather than trusted to stay in step.
    expect(fixture.mandatoryChecks).toEqual(fieldBootstrapCheckNameSchema.options);
  });

  it("every check name the guest emits is one the host recognises", () => {
    for (const testCase of fixture.cases) {
      const report = payloadOf(testCase)["report"] as { checks: { name: string }[] };
      for (const check of report.checks) {
        expect(() => fieldBootstrapCheckNameSchema.parse(check.name)).not.toThrow();
      }
    }
  });

  it.each(fixture.cases.map((testCase) => [testCase.description, testCase] as const))(
    "verifies the guest-signed envelope: %s",
    (_description, testCase) => {
      const envelope = fieldChannelEnvelopeSchema.parse(testCase.envelope);

      expect(
        verifyFieldChannelEnvelope({
          envelope,
          secret: fixture.secret,
          expectedField: envelope.field,
          expectedDirection: "guest_to_host",
          expectedKeyId: fixture.expectedKeyId,
          now: new Date(fixture.verifyAt),
        }),
      ).toMatchObject({ messageType: "bootstrap_status" });
    },
  );

  it.each(fixture.cases.map((testCase) => [testCase.description, testCase] as const))(
    "the embedded report parses under the host schema: %s",
    (_description, testCase) => {
      // The guest embeds the whole report. If the host cannot parse it, the host cannot evaluate
      // readiness from anything but the guest's own summary — which would make the summary
      // unfalsifiable.
      const report = fieldBootstrapReportSchema.parse(payloadOf(testCase)["report"]);

      expect(report.contractVersion).toBe(1);
      expect(report.checks.length).toBeGreaterThan(0);
    },
  );

  it("distinguishes ready, not_ready, and failed", () => {
    expect(payloadOf(byDescription("all checks pass"))["status"]).toBe("ready");
    expect(payloadOf(byDescription("one check missing"))["status"]).toBe("not_ready");
    expect(payloadOf(byDescription("one check failed"))["status"]).toBe("failed");
  });

  it("keeps a missing check distinct from a failed one", () => {
    // An incomplete bootstrap and a broken Field are different findings. A host that conflated
    // them could not tell "not finished yet" from "this Field is wrong".
    expect(payloadOf(byDescription("one check missing"))["failedChecks"]).toEqual([]);
    expect(payloadOf(byDescription("one check failed"))["failedChecks"]).toEqual(["display_contract"]);
  });

  it("binds every status to the boot", () => {
    for (const testCase of fixture.cases) {
      // Without this a report could be replayed into a later boot and read as current.
      expect(payloadOf(testCase)["bootId"]).toBe(fixture.bootId);
    }
  });

  it("carries no character that would canonicalise differently across languages", () => {
    for (const testCase of fixture.cases) {
      const payload = JSON.stringify(payloadOf(testCase));
      expect(payload).not.toMatch(/[+<>&]/);
      expect(payload).toMatch(/^[\x20-\x7e]*$/);
    }
  });
});
