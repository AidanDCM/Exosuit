import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { demonstrationEventSchema } from "../src/demonstration.js";
import { fieldDisplayContractSchema, fieldIdentitySchema } from "../src/fieldContracts.js";
import { fieldLifecycleSchema } from "../src/fieldRegistry.js";

const fixturePath = fileURLToPath(new URL("./fixtures/field-contract-v1.json", import.meta.url));

describe("field wire contract v1", () => {
  it("parses the shared identity, display, lifecycle, and demonstration event", async () => {
    const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as Record<string, unknown>;
    expect(fixture.contractVersion).toBe(1);
    const identity = fieldIdentitySchema.parse(fixture.identity);
    const display = fieldDisplayContractSchema.parse(fixture.display);
    const runtime = fixture.runtime as Record<string, unknown>;
    const event = demonstrationEventSchema.parse(fixture.demonstrationEvent);

    expect(identity.subsystem).toBe("field");
    expect(identity.fieldGeneration).toBe(3);
    expect(display).toMatchObject({ monitorCount: 1, width: 1920, height: 1080, dynamicResolutionAllowed: false });
    expect(fieldLifecycleSchema.parse(runtime.lifecycle)).toBe("teaching");
    expect(runtime.gloveAgentId).toBe("glove-agent-fixture");
    expect(event).toMatchObject({ source: "input", kind: "mouse_click", sequence: 4 });
  });
});
