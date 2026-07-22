import { access, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const required = [
  "README.md",
  "AGENTS.md",
  "OWNER_MANUAL.md",
  "DEVELOPER_OPERATING_SYSTEM.md",
  "docs/MASTER_SYSTEM_ROADMAP.md",
  "docs/ARCHITECTURE.md",
  "docs/SECURITY_MODEL.md",
  "docs/TEST_PLAN.md",
  "docs/GLOVE_FIELD_BOUNDARY.md",
  "docs/FIELD_ARCHITECTURE.md",
  "docs/FIELD_IMPLEMENTATION_STATUS.md",
  "docs/FIELD_OWNER_MANUAL.md",
  "docs/FIELD_DEVELOPER_MANUAL.md",
  "docs/FIELD_TEST_PLAN.md",
  "docs/qa/GLOVE_FIELD_PARTS_TRACEABILITY.md",
  "docs/qa/ATOMIC_AUDIT_2026-07-21_GLOVE_FIELD_FOUNDATION.md",
  "docs/qa/ATOMIC_AUDIT_2026-07-21_FIELD_FOUNDATION_EXPANSION.md",
  "docs/engineering_log/2026-07-21-glove-field-foundation.md",
  "docs/engineering_log/2026-07-21-field-foundation-expansion.md",
  "src/fieldContracts.ts",
  "tests/fieldContracts.test.ts",
  "src/fieldRegistry.ts",
  "tests/fieldRegistry.test.ts",
  "src/demonstration.ts",
  "tests/demonstration.test.ts",
  "src/encryptedDemonstrationStore.ts",
  "tests/encryptedDemonstrationStore.test.ts",
  "src/fieldManager.ts",
  "tests/fieldManager.test.ts",
  "src/fieldProvisioningPlan.ts",
  "tests/fieldProvisioningPlan.test.ts",
  "src/fieldScene.ts",
  "tests/fieldScene.test.ts",
  "src/shadowLearning.ts",
  "tests/shadowLearning.test.ts",
  "src/fieldPathScope.ts",
  "tests/fieldPathScope.test.ts",
  "src/fieldArtifactBroker.ts",
  "tests/fieldArtifactBroker.test.ts",
  "tests/fixtures/field-contract-v1.json",
  "tests/fieldWireContract.test.ts",
  "apps/windows-agent/FieldFoundation.cs",
  "apps/windows-agent.Tests/FieldFoundationTests.cs",
  "apps/windows-agent.Tests/FieldWireContractTests.cs",
  "src/workflowRuntime.ts",
  "tests/workflowRuntime.test.ts",
  "src/fileCheckpointStore.ts",
  "tests/fileCheckpointStore.test.ts",
  "src/encryptedCheckpointStore.ts",
  "tests/encryptedCheckpointStore.test.ts",
  "src/supervisor.ts",
  "tests/supervisor.test.ts",
  "src/supervisorRouter.ts",
  "tests/supervisorRouter.test.ts",
  "src/supervisorStore.ts",
  "tests/supervisorStore.test.ts",
  "src/virtualDesktop.ts",
  "tests/virtualDesktop.test.ts",
  "src/browserCompanion.ts",
  "tests/browserCompanion.test.ts",
  "src/browserCompanionGuard.ts",
  "tests/browserCompanionGuard.test.ts",
  "src/skills.ts",
  "tests/skills.test.ts",
  "src/skillStore.ts",
  "tests/skillStore.test.ts",
  "src/performance.ts",
  "tests/performance.test.ts",
  "src/supportBundle.ts",
  "tests/supportBundle.test.ts",
];

const sourceFiles = [
  "src/agent.ts",
  "src/applicationMap.ts",
  "src/audit.ts",
  "src/browserCompanion.ts",
  "src/browserCompanionGuard.ts",
  "src/contracts.ts",
  "src/coordinator.ts",
  "src/coordinatorMcp.ts",
  "src/demonstration.ts",
  "src/encryptedDemonstrationStore.ts",
  "src/encryptedCheckpointStore.ts",
  "src/fieldArtifactBroker.ts",
  "src/fieldContracts.ts",
  "src/fieldManager.ts",
  "src/fieldPathScope.ts",
  "src/fieldProvisioningPlan.ts",
  "src/fieldRegistry.ts",
  "src/fieldScene.ts",
  "src/fileCheckpointStore.ts",
  "src/index.ts",
  "src/mcp.ts",
  "src/motorMcp.ts",
  "src/orchestrator.ts",
  "src/orchestratorWorkflowExecutor.ts",
  "src/performance.ts",
  "src/runtimeFactory.ts",
  "src/safety.ts",
  "src/server.ts",
  "src/shadowLearning.ts",
  "src/skillStore.ts",
  "src/skills.ts",
  "src/supervisor.ts",
  "src/supervisorRouter.ts",
  "src/supervisorStore.ts",
  "src/supportBundle.ts",
  "src/timeoutFetch.ts",
  "src/virtualDesktop.ts",
  "src/workflowRuntime.ts",
  "src/workspaceSync.ts",
];

const forbiddenSourcePatterns = [
  { pattern: /from\s+["']node:child_process["']/, reason: "arbitrary process execution is excluded" },
  { pattern: /\b(?:exec|execFile|spawn|fork)Sync?\s*\(/, reason: "arbitrary process execution is excluded" },
  { pattern: /automaticExecutionAllowed\s*:\s*true/, reason: "virtual desktop switching must not be automatic" },
  { pattern: /allowHostDesktopAccess\s*:\s*(?:z\.literal\()?true/, reason: "Field policy cannot enable host desktop access" },
  { pattern: /allowHostDriveWrite\s*:\s*(?:z\.literal\()?true/, reason: "Field policy cannot enable broad host-drive write" },
  { pattern: /allowPrivilegeEscalation\s*:\s*(?:z\.literal\()?true/, reason: "Field policy cannot enable privilege escalation" },
  { pattern: /\bsk-[A-Za-z0-9_-]{20,}/, reason: "credential-shaped value detected" },
  { pattern: /Bearer\s+[A-Za-z0-9._~+\/-]{20,}/, reason: "bearer credential-shaped value detected" },
  { pattern: /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/, reason: "private key material detected" },
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

for (const path of sourceFiles) {
  let content;
  try {
    content = await readFile(resolve(root, path), "utf8");
  } catch {
    failures.push(`${path}: source file could not be read`);
    continue;
  }
  for (const rule of forbiddenSourcePatterns) {
    if (rule.pattern.test(content)) failures.push(`${path}: ${rule.reason}`);
  }
}

const virtualDesktop = await readFile(resolve(root, "src/virtualDesktop.ts"), "utf8");
for (const requiredInvariant of ["requiresLocalApproval: true", "automaticExecutionAllowed: false", "newer snapshot version"]) {
  if (!virtualDesktop.includes(requiredInvariant)) failures.push(`src/virtualDesktop.ts: missing invariant ${requiredInvariant}`);
}

const supportBundle = await readFile(resolve(root, "src/supportBundle.ts"), "utf8");
for (const forbiddenField of ["screenshot", "clipboard", "windowtitle", "elementvalue", "rawpayload"]) {
  if (!supportBundle.toLowerCase().includes(forbiddenField)) failures.push(`src/supportBundle.ts: missing privacy guard for ${forbiddenField}`);
}

const fieldContracts = await readFile(resolve(root, "src/fieldContracts.ts"), "utf8");
for (const requiredInvariant of [
  'subsystem: z.literal("field")',
  "fieldGeneration: z.number().int().positive()",
  "dynamicResolutionAllowed: z.literal(false)",
  "allowHostDesktopAccess: z.literal(false)",
  "allowHostDriveWrite: z.literal(false)",
  "allowPrivilegeEscalation: z.literal(false)",
  "timingSafeEqual",
]) {
  if (!fieldContracts.includes(requiredInvariant)) failures.push(`src/fieldContracts.ts: missing Field invariant ${requiredInvariant}`);
}

const fieldManager = await readFile(resolve(root, "src/fieldManager.ts"), "utf8");
for (const requiredInvariant of [
  "FakeFieldProvisioner",
  "#provisionedPolicyHashes",
  "differs from the policy used for provisioning",
  "field_provisioning_started",
  "field_destroyed",
  "verifyAudit",
]) {
  if (!fieldManager.includes(requiredInvariant)) failures.push(`src/fieldManager.ts: missing Field Manager invariant ${requiredInvariant}`);
}

const provisioning = await readFile(resolve(root, "src/fieldProvisioningPlan.ts"), "utf8");
for (const requiredInvariant of [
  'hypervisor: z.literal("hyper-v")',
  "vmGeneration: z.literal(2)",
  "broadDriveMapping: z.literal(false)",
  "hostInputInjection: z.literal(false)",
  "Field provisioning plan failed integrity verification",
]) {
  if (!provisioning.includes(requiredInvariant)) failures.push(`src/fieldProvisioningPlan.ts: missing provisioning invariant ${requiredInvariant}`);
}

const demonstration = await readFile(resolve(root, "src/demonstration.ts"), "utf8");
for (const requiredInvariant of ["granted: z.literal(true)", "Demonstration event limit reached", "[REDACTED]", "timestamp order"]) {
  if (!demonstration.includes(requiredInvariant)) failures.push(`src/demonstration.ts: missing recording invariant ${requiredInvariant}`);
}

const encryptedDemonstrations = await readFile(resolve(root, "src/encryptedDemonstrationStore.ts"), "utf8");
for (const requiredInvariant of [
  'algorithm: z.literal("aes-256-gcm")',
  "Only completed or aborted demonstration episodes may be persisted",
  "Inline visual bytes are forbidden",
  "deleteByField",
  "authentication failed",
]) {
  if (!encryptedDemonstrations.includes(requiredInvariant)) {
    failures.push(`src/encryptedDemonstrationStore.ts: missing privacy or persistence invariant ${requiredInvariant}`);
  }
}

const fieldScene = await readFile(resolve(root, "src/fieldScene.ts"), "utf8");
for (const requiredInvariant of [
  "Scene versions must increase",
  "Secure desktop blocks Field input",
  "Locked Field session blocks input",
  "Field input queue is already busy",
  "Active window identity must match",
]) {
  if (!fieldScene.includes(requiredInvariant)) failures.push(`src/fieldScene.ts: missing scene invariant ${requiredInvariant}`);
}

const shadowLearning = await readFile(resolve(root, "src/shadowLearning.ts"), "utf8");
for (const requiredInvariant of [
  "executionAllowed: z.literal(false)",
  "different Field generations",
  "same source observation",
  "Trajectory timestamps must increase strictly",
]) {
  if (!shadowLearning.includes(requiredInvariant)) failures.push(`src/shadowLearning.ts: missing Shadow invariant ${requiredInvariant}`);
}

const pathScope = await readFile(resolve(root, "src/fieldPathScope.ts"), "utf8");
for (const requiredInvariant of [
  "alternate data streams are forbidden",
  "reserved device names are forbidden",
  "reparseInspectionRequired: z.literal(true)",
  "transfer is not allowed through Field directory",
]) {
  if (!pathScope.includes(requiredInvariant)) failures.push(`src/fieldPathScope.ts: missing path-scope invariant ${requiredInvariant}`);
}

const artifactBroker = await readFile(resolve(root, "src/fieldArtifactBroker.ts"), "utf8");
for (const requiredInvariant of [
  "expectedSha256",
  "timingSafeEqual",
  "Sensitive Field artifacts require a separate owner-reviewed export path",
  "Untrusted Field artifacts must be reviewed and reclassified before export",
  "Only a verified artifact transfer can complete",
]) {
  if (!artifactBroker.includes(requiredInvariant)) failures.push(`src/fieldArtifactBroker.ts: missing artifact invariant ${requiredInvariant}`);
}

const boundary = await readFile(resolve(root, "docs/GLOVE_FIELD_BOUNDARY.md"), "utf8");
for (const requiredStatement of [
  "One repository, two products",
  "The Glove is not the VM. The Field is not the agent.",
  "Teach Mode requires explicit owner consent",
]) {
  if (!boundary.includes(requiredStatement)) failures.push(`docs/GLOVE_FIELD_BOUNDARY.md: missing boundary statement ${requiredStatement}`);
}

if (failures.length > 0) {
  console.error("Exosuit repository safety validation failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Exosuit repository safety validation passed (${required.length} required artifacts checked).`);
}
