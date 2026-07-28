#!/usr/bin/env node
/**
 * Phase 10 benchmark harness.
 *
 * `docs/MASTER_SYSTEM_ROADMAP.md` Phase 10 requires numeric service targets to be
 * "established from local benchmarks rather than invented in advance". This script
 * produces the measurements. It deliberately does **not** assert or propose targets:
 * choosing them is an owner decision informed by these numbers plus real-desktop runs.
 *
 * Scope: everything here runs against the in-process fake provider and the workflow
 * runtime. Target classes that require a real Windows desktop are reported as NOT
 * COVERED rather than approximated, because a fake-provider number for focus-switch or
 * motor-start latency would be meaningless and misleading.
 *
 * Usage:
 *   npm run build
 *   node scripts/benchmark.mjs [--iterations 200] [--report path.md]
 *   node --expose-gc scripts/benchmark.mjs        # tighter memory figures
 */
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(process.cwd());
const distEntry = resolve(root, "dist/src/agent.js");
if (!existsSync(distEntry)) {
  process.stderr.write("dist/ not found. Run `npm run build` first.\n");
  process.exit(1);
}

const load = (relative) => import(pathToFileURL(resolve(root, relative)).href);
const { FakeDesktopAgent } = await load("dist/src/agent.js");
const { ApplicationMapStore } = await load("dist/src/applicationMap.js");
const { ExosuitOrchestrator } = await load("dist/src/orchestrator.js");
const { HashChainLedger } = await load("dist/src/audit.js");
const { WorkflowRuntime } = await load("dist/src/workflowRuntime.js");

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index > -1 ? process.argv[index + 1] : fallback;
}
const iterations = Number(arg("--iterations", "200"));
const reportPath = arg("--report", undefined);
const warmup = Math.max(5, Math.floor(iterations * 0.1));

function percentile(sorted, p) {
  if (sorted.length === 0) return Number.NaN;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

const measurements = [];
const notCovered = [];

async function measure(name, unit, fn, { setup, iterations: count = iterations } = {}) {
  for (let i = 0; i < warmup; i += 1) await fn(await setup?.(i), i);
  const samples = [];
  for (let i = 0; i < count; i += 1) {
    const context = await setup?.(i);
    const started = process.hrtime.bigint();
    await fn(context, i);
    samples.push(Number(process.hrtime.bigint() - started) / 1e6);
  }
  samples.sort((a, b) => a - b);
  const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  measurements.push({
    name,
    unit,
    n: samples.length,
    min: samples[0],
    p50: percentile(samples, 50),
    p95: percentile(samples, 95),
    p99: percentile(samples, 99),
    max: samples[samples.length - 1],
    mean,
  });
  process.stdout.write(
    `${name.padEnd(46)} p50 ${percentile(samples, 50).toFixed(3)}  p95 ${percentile(samples, 95).toFixed(3)}  p99 ${percentile(samples, 99).toFixed(3)} ${unit}\n`,
  );
}

function newOrchestrator() {
  return new ExosuitOrchestrator({
    agent: new FakeDesktopAgent({ mode: "sandbox" }),
    ledger: new HashChainLedger(),
    applicationMaps: new ApplicationMapStore(),
  });
}

function setValueAction(id) {
  return {
    id: `bench-${id}`,
    actionType: "set_element_value",
    route: "os_accessibility",
    targetWindowId: "win-notepad",
    targetElementId: "el-editor",
    text: `benchmark ${id}`,
    rationale: "Phase 10 benchmark harness measurement.",
    expected: { kind: "element_value", elementId: "el-editor", equals: `benchmark ${id}` },
    requestedBy: "test",
  };
}

process.stdout.write(
  `Phase 10 benchmark harness — fake provider, ${iterations} iterations (+${warmup} warmup)\n\n`,
);

// --- Latency classes measurable against the fake provider -------------------------

{
  const orchestrator = newOrchestrator();
  await measure("observation latency", "ms", () =>
    orchestrator.observe({ includeElements: true, maxElements: 250 }),
  );
}

{
  const orchestrator = newOrchestrator();
  await measure("semantic-action proposal latency", "ms", (_, i) =>
    orchestrator.proposeAction(setValueAction(i)),
  );
}

{
  const orchestrator = newOrchestrator();
  await measure(
    "execute + verify latency",
    "ms",
    async (proposalId) => orchestrator.executeProposal(proposalId),
    { setup: async (i) => (await orchestrator.proposeAction(setValueAction(i))).proposalId },
  );
}

// Emergency stop is single-use per agent, so each sample needs a fresh orchestrator.
// The setup cost is excluded: only the stop call itself is timed.
await measure("emergency-stop latency", "ms", (orchestrator) => orchestrator.emergencyStop("benchmark"), {
  setup: async () => newOrchestrator(),
  iterations: Math.min(iterations, 100),
});

{
  const ledger = new HashChainLedger();
  await measure("audit append latency", "ms", (_, i) =>
    ledger.append({ eventType: "benchmark_event", actor: "bench", payload: { i } }),
  );
}

// --- Workflow scheduler overhead ---------------------------------------------------

// The workspace registry requires monotonically increasing versions, so callers that
// update the same runtime more than once must supply an advancing version.
function workspaceWith(windowCount, registryVersion = 1) {
  return {
    contractVersion: 1,
    workspaceId: "workspace-bench",
    agentId: "agent-bench",
    windowsSessionId: "session-bench",
    currentVirtualDesktopId: "desktop-a",
    windowRegistryVersion: registryVersion,
    capturedAt: new Date().toISOString(),
    unexpectedDialogWindowId: null,
    windows: Array.from({ length: windowCount }, (_, i) => ({
      agentId: "agent-bench",
      windowsSessionId: "session-bench",
      windowId: `window-${i}`,
      windowGeneration: 1,
      processId: 100 + i,
      processName: `process-${i}`,
      fingerprint: `process-${i}:window-${i}:v1`,
      virtualDesktopId: "desktop-a",
      isActive: i === 0,
      isVisible: true,
      isMinimized: false,
    })),
  };
}

function linearWorkflow(workflowId, stepCount) {
  return {
    contractVersion: 1,
    workflowId,
    requestedBy: "bench",
    riskCeiling: "low",
    steps: Array.from({ length: stepCount }, (_, i) => ({
      stepId: `step-${i}`,
      dependsOn: i === 0 ? [] : [`step-${i - 1}`],
      workspaceId: "workspace-bench",
      targetWindow: {
        agentId: "agent-bench",
        windowsSessionId: "session-bench",
        windowId: "window-0",
        windowGeneration: 1,
      },
      resourceMode: "read",
      actionIntent: `Step ${i}.`,
      expectedResult: `Step ${i} done.`,
      timeoutMs: 5_000,
      inputArtifactNames: [],
      outputArtifactNames: [],
      externalEffect: "none",
    })),
  };
}

const noopExecutor = {
  async execute() {
    return { status: "succeeded", summary: "bench", verificationStatus: "passed" };
  },
};

{
  const steps = 10;
  let counter = 0;
  await measure(
    `workflow scheduler overhead (${steps} steps, per step)`,
    "ms/step",
    async (runtime) => {
      const id = `wf-${counter += 1}`;
      runtime.create(linearWorkflow(id, steps));
      const started = process.hrtime.bigint();
      await runtime.runUntilBlocked(id, noopExecutor);
      return Number(process.hrtime.bigint() - started) / 1e6 / steps;
    },
    {
      setup: async () => {
        const runtime = new WorkflowRuntime();
        runtime.updateWorkspace(workspaceWith(3));
        return runtime;
      },
      iterations: Math.min(iterations, 50),
    },
  );
}

// Scheduler cost per step is not constant: it grows with workflow length. Averaging a
// single size would hide that, so scaling is measured explicitly and reported as its own
// table. This is the "workflow scheduler overhead" and "maximum workflows" target class.
const schedulerScaling = [];
{
  for (const steps of [1, 5, 10, 25, 50, 100]) {
    const runs = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const runtime = new WorkflowRuntime();
      runtime.updateWorkspace(workspaceWith(1));
      const id = `scale-${steps}-${attempt}`;
      runtime.create(linearWorkflow(id, steps));
      const started = process.hrtime.bigint();
      await runtime.runUntilBlocked(id, noopExecutor);
      runs.push(Number(process.hrtime.bigint() - started) / 1e6);
    }
    runs.sort((a, b) => a - b);
    const median = runs[Math.floor(runs.length / 2)];
    schedulerScaling.push({ steps, totalMs: median, perStepMs: median / steps });
    process.stdout.write(
      `${`scheduler, ${steps} step workflow`.padEnd(46)} total ${median.toFixed(1)} ms  per-step ${(median / steps).toFixed(2)} ms\n`,
    );
  }
}

// --- Resource classes ---------------------------------------------------------------

function heapUsed() {
  if (typeof global.gc === "function") global.gc();
  return process.memoryUsage().heapUsed;
}

const resourceNotes = [];
{
  const counts = [10, 100, 1_000];
  const rows = [];
  for (const count of counts) {
    // A fresh runtime per count, so each figure is that many windows from zero rather
    // than the residue of the previous, larger snapshot.
    const baseline = heapUsed();
    const runtime = new WorkflowRuntime();
    runtime.updateWorkspace(workspaceWith(count));
    rows.push({ count, bytes: heapUsed() - baseline, runtime });
  }
  const largest = rows[rows.length - 1];
  const perWindow = largest.bytes / largest.count;
  resourceNotes.push({
    name: "memory per tracked window",
    value: `~${(perWindow / 1024).toFixed(2)} KiB/window at ${largest.count} windows`,
    caveat:
      typeof global.gc === "function"
        ? "measured with forced GC"
        : "no forced GC available; run with `node --expose-gc` for a tighter figure",
  });
  process.stdout.write(
    `${"memory per tracked window".padEnd(46)} ~${(perWindow / 1024).toFixed(2)} KiB/window (n=${largest.count})\n`,
  );
}

{
  const ledger = new HashChainLedger();
  const events = 1_000;
  for (let i = 0; i < events; i += 1) {
    await ledger.append({ eventType: "growth_probe", actor: "bench", payload: { i } });
  }
  const bytes = Buffer.byteLength(JSON.stringify(ledger.tail(events)), "utf8");
  resourceNotes.push({
    name: "audit growth",
    value: `~${(bytes / events).toFixed(0)} bytes/event (serialized, ${events} events)`,
    caveat: "in-memory serialization; on-disk JSONL adds a newline per record",
  });
  process.stdout.write(
    `${"audit growth".padEnd(46)} ~${(bytes / events).toFixed(0)} bytes/event\n`,
  );
}

// --- Explicitly not covered ----------------------------------------------------------

notCovered.push(
  ["focus-switch latency", "requires a real interactive Windows desktop"],
  ["motor start latency", "requires armed physical input in a disposable VM"],
  ["CPU while idle and observing", "requires a real provider and a quiet machine profile"],
  ["maximum agents", "requires multiple real agents or VMs"],
);
process.stdout.write("\nNot covered by this harness:\n");
for (const [name, reason] of notCovered) {
  process.stdout.write(`  - ${name}: ${reason}\n`);
}

// --- Report --------------------------------------------------------------------------

if (reportPath) {
  const fixed = (value) => (Number.isFinite(value) ? value.toFixed(3) : "n/a");
  const lines = [
    "# Phase 10 Benchmark Baseline",
    "",
    `**Generated:** ${new Date().toISOString()}`,
    `**Iterations:** ${iterations} (plus ${warmup} warmup)`,
    `**Node:** ${process.version} · **Platform:** ${process.platform} ${process.arch}`,
    "",
    "> These are **measurements, not targets.** The roadmap requires Phase 10 service",
    "> targets to be derived from benchmarks rather than invented in advance; choosing",
    "> them is an owner decision that also needs real-desktop numbers. Every figure here",
    "> comes from the in-process fake provider on one developer workstation, so it",
    "> characterizes Exosuit's own overhead, not real desktop responsiveness.",
    "",
    "## Latency",
    "",
    "| Measurement | n | min | p50 | p95 | p99 | max | unit |",
    "|---|--:|--:|--:|--:|--:|--:|---|",
    ...measurements.map(
      (m) =>
        `| ${m.name} | ${m.n} | ${fixed(m.min)} | ${fixed(m.p50)} | ${fixed(m.p95)} | ${fixed(m.p99)} | ${fixed(m.max)} | ${m.unit} |`,
    ),
    "",
    "## Workflow scheduler scaling",
    "",
    "Median of 5 runs per size, no-op executor, so this is scheduler overhead alone.",
    "",
    "| Steps | Total | Per step |",
    "|--:|--:|--:|",
    ...schedulerScaling.map(
      (row) => `| ${row.steps} | ${row.totalMs.toFixed(1)} ms | ${row.perStepMs.toFixed(2)} ms |`,
    ),
    "",
    "**Per-step cost is not constant — it grows with workflow length.** Total time rises",
    "faster than step count, which is the signature of per-step work that is linear in the",
    "number of steps (an O(n^2) scheduler). Small workflows are unaffected; long ones",
    "degrade. This is a measurement, not a diagnosis: the responsible code has not been",
    "profiled and no fix is claimed here.",
    "",
    "## Resource use",
    "",
    "| Measurement | Value | Caveat |",
    "|---|---|---|",
    ...resourceNotes.map((r) => `| ${r.name} | ${r.value} | ${r.caveat} |`),
    "",
    "## Target classes not covered",
    "",
    "These are listed in the Phase 10 objectives but cannot be measured against a fake",
    "provider. A fabricated number here would be worse than none.",
    "",
    ...notCovered.map(([name, reason]) => `- **${name}** — ${reason}`),
    "",
  ];
  writeFileSync(resolve(root, reportPath), lines.join("\n"), "utf8");
  process.stdout.write(`\nReport written to ${reportPath}\n`);
}
