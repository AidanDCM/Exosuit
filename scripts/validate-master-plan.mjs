import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const path = resolve(root, "docs/MASTER_SYSTEM_ROADMAP.md");
const failures = [];

let plan = "";
try {
  const details = await stat(path);
  if (!details.isFile()) failures.push("docs/MASTER_SYSTEM_ROADMAP.md is not a file");
  if (details.size < 30_000) failures.push("master plan is too small to contain the required end-to-end program");
  plan = await readFile(path, "utf8");
} catch {
  failures.push("docs/MASTER_SYSTEM_ROADMAP.md is missing or unreadable");
}

const requiredStatements = [
  "single authoritative planning document",
  "The Glove is not the VM. The Field is not the agent.",
  "## 5. Browser rule",
  "does **not** depend on:",
  "## 11. Field physical design",
  "Disposable differencing OS overlay per Field generation",
  "## 16. Operating modes",
  "### 16.1 Teach Mode",
  "### 16.2 Shadow Mode",
  "### 16.3 Correction Mode",
  "### 16.4 Assisted Mode",
  "### 16.5 Pilot Mode",
  "## 17. Teach Mode capture design",
  "## 19. Behavioral model decomposition",
  "### 19.3 Motor model",
  "### 19.4 Typing and editing model",
  "### 19.5 Language and communication model",
  "### 19.6 Timing and behavioral-state model",
  "## 20. Learning pipeline",
  "## Phase L0 — Exact-head source validation",
  "## Phase L1 — Synthetic Hyper-V Field lifecycle",
  "## Phase L2 — Authenticated live channel and heartbeat",
  "## Phase L3 — Guest bootstrap, display, readiness, and replacement",
  "## Phase L4 — Live scene production",
  "## Phase L5 — Consented Teach recording",
  "## Phase L6 — Live bounded artifact broker",
  "## Phase L7 — Demonstration processing and retrieval",
  "## Phase L8 — Retrieval-backed Shadow predictor",
  "## Phase L9 — Correction Mode",
  "## Phase L10 — Personal task and attention models",
  "## Phase L11 — Personal motor, typing, timing, and language models",
  "## Phase L12 — Assisted Mode and bounded personal skills",
  "## Phase L13 — Synthetic Pilot workflow",
  "## Phase L14 — ChatGPT MCP Field acceptance",
  "## Phase L15 — Low-risk owner acceptance",
  "## Phase L16 — Reliability, performance, and resource governance",
  "## Phase L17 — Owner cockpit and human factors",
  "## Phase L18 — Packaging, signing, updates, and rollback",
  "## Phase L19 — Production security, privacy, and abuse review",
  "## Phase L20 — Production candidate and operations",
  "## 32. Definition of done for every phase",
  "## 33. Definition of done for the complete system",
  "## 34. Immediate execution order",
  "## 35. Change-control rules",
  "## 37. Planning honesty",
];

for (const statement of requiredStatements) {
  if (!plan.includes(statement)) failures.push(`master plan is missing required section or statement: ${statement}`);
}

const forbiddenStaleStatements = [
  "## Phase 5 — Browser Semantic Companion",
  "fallback order: application API → browser companion",
  "browser companion or native companion exposes",
];

for (const statement of forbiddenStaleStatements) {
  if (plan.includes(statement)) failures.push(`master plan contains stale browser-special architecture: ${statement}`);
}

const phaseMatches = [...plan.matchAll(/^## Phase L(\d+)(?:\s|\u2014)/gm)].map((match) => Number(match[1]));
for (let level = 0; level <= 20; level += 1) {
  if (!phaseMatches.includes(level)) failures.push(`master plan is missing Phase L${level}`);
}

for (const phase of ["L0", "L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8", "L9", "L10", "L11", "L12", "L13", "L14", "L15", "L16", "L17", "L18", "L19", "L20"]) {
  const start = plan.indexOf(`## Phase ${phase}`);
  const next = plan.indexOf("\n## Phase L", start + 10);
  const section = start >= 0 ? plan.slice(start, next >= 0 ? next : undefined) : "";
  if (!section.includes("### Objective")) failures.push(`${phase} is missing an objective`);
  if (!section.includes("### Promotion gate") && !section.includes("### Release gate")) {
    failures.push(`${phase} is missing a promotion or release gate`);
  }
}

if (failures.length > 0) {
  console.error("Exosuit master plan validation failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Exosuit master plan validation passed (${plan.length} characters, ${phaseMatches.length} phased program sections).`);
}
