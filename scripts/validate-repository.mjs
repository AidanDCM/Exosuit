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
  "src/encryptedCheckpointStore.ts",
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
for (const requiredInvariant of [
  "requiresLocalApproval: true",
  "automaticExecutionAllowed: false",
  "newer snapshot version",
]) {
  if (!virtualDesktop.includes(requiredInvariant)) {
    failures.push(`src/virtualDesktop.ts: missing invariant ${requiredInvariant}`);
  }
}

const supportBundle = await readFile(resolve(root, "src/supportBundle.ts"), "utf8");
for (const forbiddenField of ["screenshot", "clipboard", "windowtitle", "elementvalue", "rawpayload"]) {
  if (!supportBundle.toLowerCase().includes(forbiddenField)) {
    failures.push(`src/supportBundle.ts: missing privacy guard for ${forbiddenField}`);
  }
}

if (failures.length > 0) {
  console.error("Exosuit repository safety validation failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Exosuit repository safety validation passed (${required.length} required artifacts checked).`);
}
