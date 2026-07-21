import { access, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const pairs = [
  ["src/fieldContracts.ts", "tests/fieldContracts.test.ts"],
  ["src/fieldRegistry.ts", "tests/fieldRegistry.test.ts"],
  ["src/fieldManager.ts", "tests/fieldManager.test.ts"],
  ["src/fieldProvisioningPlan.ts", "tests/fieldProvisioningPlan.test.ts"],
  ["src/fieldBootstrap.ts", "tests/fieldBootstrap.test.ts"],
  ["src/fieldChannel.ts", "tests/fieldChannel.test.ts"],
  ["src/fieldHeartbeat.ts", "tests/fieldHeartbeat.test.ts"],
  ["src/fieldCommand.ts", "tests/fieldCommand.test.ts"],
  ["src/teachRecorder.ts", "tests/teachRecorder.test.ts"],
  ["src/demonstration.ts", "tests/demonstration.test.ts"],
  ["src/encryptedDemonstrationStore.ts", "tests/encryptedDemonstrationStore.test.ts"],
  ["src/visualRetention.ts", "tests/visualRetention.test.ts"],
  ["src/fieldScene.ts", "tests/fieldScene.test.ts"],
  ["src/shadowLearning.ts", "tests/shadowLearning.test.ts"],
  ["src/fieldPathScope.ts", "tests/fieldPathScope.test.ts"],
  ["src/fieldArtifactBroker.ts", "tests/fieldArtifactBroker.test.ts"],
  ["src/fieldRecovery.ts", "tests/fieldRecovery.test.ts"],
  ["src/fieldAdminAuthority.ts", "tests/fieldAdminAuthority.test.ts"],
  ["src/fieldSupportBundle.ts", "tests/fieldSupportBundle.test.ts"],
];

const required = [
  ...pairs.flat(),
  "tests/fieldSystemPulse.test.ts",
  "tests/fixtures/field-contract-v1.json",
  "tests/fixtures/field-channel-v1.json",
  "tests/fieldWireContract.test.ts",
  "tests/fieldChannelWireContract.test.ts",
  "apps/windows-agent/FieldFoundation.cs",
  "apps/windows-agent/FieldChannelFoundation.cs",
  "apps/windows-agent.Tests/FieldFoundationTests.cs",
  "apps/windows-agent.Tests/FieldChannelFoundationTests.cs",
  "apps/windows-agent.Tests/FieldWireContractTests.cs",
  "apps/windows-agent.Tests/FieldChannelWireContractTests.cs",
  "docs/GLOVE_FIELD_BOUNDARY.md",
  "docs/FIELD_ARCHITECTURE.md",
  "docs/FIELD_IMPLEMENTATION_STATUS.md",
  "docs/FIELD_OWNER_MANUAL.md",
  "docs/FIELD_DEVELOPER_MANUAL.md",
  "docs/FIELD_TEST_PLAN.md",
  "docs/qa/GLOVE_FIELD_PARTS_TRACEABILITY.md",
];

const failures = [];
for (const path of required) {
  try {
    await access(resolve(root, path));
    const details = await stat(resolve(root, path));
    if (!details.isFile() || details.size === 0) failures.push(`${path}: missing or empty`);
  } catch {
    failures.push(`${path}: missing or unreadable`);
  }
}

const sourcePaths = pairs.map(([source]) => source);
const source = new Map();
for (const path of sourcePaths) {
  try {
    const content = await readFile(resolve(root, path), "utf8");
    source.set(path, content);
    for (const rule of [
      { pattern: /from\s+["']node:child_process["']/, reason: "arbitrary process execution is excluded" },
      { pattern: /\b(?:exec|execFile|spawn|fork)Sync?\s*\(/, reason: "arbitrary process execution is excluded" },
      { pattern: /inputInjectionAllowed\s*:\s*true/, reason: "Teach Mode must never inject input" },
      { pattern: /executionAllowed\s*:\s*(?:z\.literal\()?true/, reason: "Shadow predictions must never authorize execution" },
      { pattern: /allowHostDesktopAccess\s*:\s*(?:z\.literal\()?true/, reason: "Field policy cannot authorize host desktop access" },
      { pattern: /allowHostDriveWrite\s*:\s*(?:z\.literal\()?true/, reason: "Field policy cannot authorize broad host-drive write" },
      { pattern: /allowPrivilegeEscalation\s*:\s*(?:z\.literal\()?true/, reason: "Field policy cannot authorize privilege escalation" },
      { pattern: /storeInlineBytes\s*:\s*(?:z\.literal\()?true/, reason: "visual metadata cannot store inline image bytes" },
    ]) {
      if (rule.pattern.test(content)) failures.push(`${path}: ${rule.reason}`);
    }
  } catch {
    // Required-file check already records the failure.
  }
}

const invariants = new Map([
  ["src/fieldContracts.ts", ["subsystem: z.literal(\"field\")", "allowHostDesktopAccess: z.literal(false)", "timingSafeEqual"]],
  ["src/fieldChannel.ts", ["timingSafeEqual", "message ID was replayed", "nonce was replayed", "sequence must increase strictly"]],
  ["src/fieldHeartbeat.ts", ["Guest heartbeat expired", "boot identity changed", "cannot report the desktop ready"]],
  ["src/fieldCommand.ts", ["pilot_mode_required", "shutdown_admin_only", "Guest execution accepts only approved desktop routes"]],
  ["src/teachRecorder.ts", ["inputInjectionAllowed: false", "cannot start before consent", "recordingIndicatorVisible"]],
  ["src/visualRetention.ts", ["storeInlineBytes: z.literal(false)", "explicit consent", "Visual session byte budget exceeded"]],
  ["src/shadowLearning.ts", ["executionAllowed: z.literal(false)", "same source observation"]],
  ["src/fieldRecovery.ts", ["possible external effect", "stop and rebuild instead of continuing blind", "Emergency stop failure is release-blocking"]],
  ["src/fieldAdminAuthority.ts", ["pilot_has_no_admin_authority", "modelMaySatisfyReview: false", "local_transport_required"]],
  ["src/fieldSupportBundle.ts", ["screenshot", "windowtitle", "operatorid", "failed integrity verification"]],
]);
for (const [path, values] of invariants) {
  const content = source.get(path) ?? "";
  for (const value of values) if (!content.includes(value)) failures.push(`${path}: missing invariant ${value}`);
}

const channelFixture = JSON.parse(await readFile(resolve(root, "tests/fixtures/field-channel-v1.json"), "utf8"));
if (channelFixture.envelope?.direction !== "guest_to_host" || channelFixture.envelope?.sequence !== 7) {
  failures.push("tests/fixtures/field-channel-v1.json: unexpected canonical fixture identity");
}
if (!/^[A-Za-z0-9_-]{43}$/.test(channelFixture.envelope?.signature ?? "")) {
  failures.push("tests/fixtures/field-channel-v1.json: invalid signature shape");
}

if (failures.length > 0) {
  console.error("Exosuit Field validation failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Exosuit Field validation passed (${required.length} required artifacts and ${sourcePaths.length} source modules checked).`);
}
