import { access, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const pairs = [
  ["src/fieldContracts.ts", "tests/fieldContracts.test.ts"],
  ["src/fieldRegistry.ts", "tests/fieldRegistry.test.ts"],
  ["src/fieldManager.ts", "tests/fieldManager.test.ts"],
  ["src/fieldManagerStore.ts", "tests/fieldManagerStore.test.ts"],
  ["src/fieldProvisioningPlan.ts", "tests/fieldProvisioningPlan.test.ts"],
  ["src/fieldBootstrap.ts", "tests/fieldBootstrap.test.ts"],
  ["src/fieldChannel.ts", "tests/fieldChannel.test.ts"],
  ["src/fieldHeartbeat.ts", "tests/fieldHeartbeat.test.ts"],
  ["src/fieldLiveReadiness.ts", "tests/fieldLiveReadiness.test.ts"],
  ["src/fieldCommand.ts", "tests/fieldCommand.test.ts"],
  ["src/teachRecorder.ts", "tests/teachRecorder.test.ts"],
  ["src/demonstration.ts", "tests/demonstration.test.ts"],
  ["src/demonstrationProcessing.ts", "tests/demonstrationProcessing.test.ts"],
  ["src/encryptedDemonstrationStore.ts", "tests/encryptedDemonstrationStore.test.ts"],
  ["src/visualRetention.ts", "tests/visualRetention.test.ts"],
  ["src/fieldScene.ts", "tests/fieldScene.test.ts"],
  ["src/shadowLearning.ts", "tests/shadowLearning.test.ts"],
  ["src/retrievalShadowPredictor.ts", "tests/retrievalShadowPredictor.test.ts"],
  ["src/fieldPathScope.ts", "tests/fieldPathScope.test.ts"],
  ["src/fieldArtifactBroker.ts", "tests/fieldArtifactBroker.test.ts"],
  ["src/fieldRecovery.ts", "tests/fieldRecovery.test.ts"],
  ["src/fieldAdminAuthority.ts", "tests/fieldAdminAuthority.test.ts"],
  ["src/fieldSupportBundle.ts", "tests/fieldSupportBundle.test.ts"],
];

const windowsScripts = [
  "scripts/windows/Test-ExosuitFieldHost.ps1",
  "scripts/windows/Show-ExosuitFieldProvisioningPlan.ps1",
  "scripts/windows/Invoke-ExosuitFieldProvisioning.ps1",
  "scripts/windows/Remove-ExosuitFieldGeneration.ps1",
  "scripts/windows/Initialize-ExosuitFieldGuest.ps1",
  "scripts/windows/Install-ExosuitFieldGuest.ps1",
  "scripts/windows/Start-ExosuitFieldGuest.ps1",
  "scripts/windows/Read-ExosuitFieldGuestKvp.ps1",
  "scripts/windows/SetupComplete-ExosuitFieldGuest.cmd",
];

const required = [
  ...pairs.flat(),
  ...windowsScripts,
  "tests/windowsFieldScripts.test.ts",
  "tests/fieldSystemPulse.test.ts",
  "tests/fixtures/field-contract-v1.json",
  "tests/fixtures/field-channel-v1.json",
  "tests/fieldWireContract.test.ts",
  "tests/fieldChannelWireContract.test.ts",
  "vm/field-host-config.example.json",
  "apps/windows-agent/FieldFoundation.cs",
  "apps/windows-agent/FieldChannelFoundation.cs",
  "apps/windows-agent/FieldKvpRuntime.cs",
  "apps/windows-agent.Tests/FieldFoundationTests.cs",
  "apps/windows-agent.Tests/FieldChannelFoundationTests.cs",
  "apps/windows-agent.Tests/FieldKvpRuntimeTests.cs",
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
  ["src/fieldManagerStore.ts", ["timingSafeEqual", "failed integrity verification", "mode: 0o600", "flag: \"wx\""]],
  ["src/fieldProvisioningPlan.ts", ["runtimeOverlay", "differencing: z.literal(true)", "Runtime overlay must be a child"]],
  ["src/fieldChannel.ts", ["timingSafeEqual", "message ID was replayed", "nonce was replayed", "sequence must increase strictly"]],
  ["src/fieldHeartbeat.ts", ["Guest heartbeat expired", "boot identity changed", "cannot report the desktop ready"]],
  ["src/fieldLiveReadiness.ts", ["attested_identity_mismatch", "policy_binding_mismatch", "heartbeat_or_desktop_not_ready"]],
  ["src/fieldCommand.ts", ["pilot_mode_required", "shutdown_admin_only", "Guest execution accepts only approved desktop routes"]],
  ["src/teachRecorder.ts", ["inputInjectionAllowed: false", "cannot start before consent", "recordingIndicatorVisible"]],
  ["src/demonstrationProcessing.ts", ["Only a terminal demonstration episode", "removeSourceEpisode", "layoutFingerprint", "sourceEventIds"]],
  ["src/visualRetention.ts", ["storeInlineBytes: z.literal(false)", "explicit consent", "Visual session byte budget exceeded"]],
  ["src/shadowLearning.ts", ["executionAllowed: z.literal(false)", "same source observation"]],
  ["src/retrievalShadowPredictor.ts", ["executionAllowed: z.literal(false)", "no_relevant_demonstration", "unexpected_modal", "retrieval-shadow-baseline-v1"]],
  ["src/fieldRecovery.ts", ["possible external effect", "stop and rebuild instead of continuing blind", "Emergency stop failure is release-blocking"]],
  ["src/fieldAdminAuthority.ts", ["pilot_has_no_admin_authority", "modelMaySatisfyReview: false", "local_transport_required"]],
  ["src/fieldSupportBundle.ts", ["screenshot", "windowtitle", "operatorid", "failed integrity verification"]],
]);
for (const [path, values] of invariants) {
  const content = source.get(path) ?? "";
  for (const value of values) if (!content.includes(value)) failures.push(`${path}: missing invariant ${value}`);
}

for (const path of windowsScripts) {
  const content = await readFile(resolve(root, path), "utf8");
  if (/\bInvoke-Expression\b|\biex\s+/i.test(content)) failures.push(`${path}: arbitrary PowerShell evaluation is forbidden`);
  if (/DownloadString|Invoke-WebRequest|Start-BitsTransfer/i.test(content)) failures.push(`${path}: provisioning scripts must not download code or images`);
}

const applyScript = await readFile(resolve(root, "scripts/windows/Invoke-ExosuitFieldProvisioning.ps1"), "utf8");
for (const invariant of [
  "CREATE FIELD $fieldId GENERATION $generation",
  "New-VHD -Path $runtimeOverlayPath -ParentPath $base.path -Differencing",
  "Filtered NAT apply is held",
  "artifactBrokerOnly",
]) {
  if (!applyScript.includes(invariant)) failures.push(`scripts/windows/Invoke-ExosuitFieldProvisioning.ps1: missing invariant ${invariant}`);
}

const destroyScript = await readFile(resolve(root, "scripts/windows/Remove-ExosuitFieldGeneration.ps1"), "utf8");
for (const invariant of ["DESTROY FIELD $fieldIdText GENERATION $FieldGeneration", "Refusing deletion through reparse point"]) {
  if (!destroyScript.includes(invariant)) failures.push(`scripts/windows/Remove-ExosuitFieldGeneration.ps1: missing invariant ${invariant}`);
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
