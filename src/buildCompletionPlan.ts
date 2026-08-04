import { z } from "zod";
import { sha256Canonical } from "./fieldContracts.js";

export const completionTargetSchema = z.enum(["personal_mvp", "daily_driver", "production"]);
export type CompletionTarget = z.infer<typeof completionTargetSchema>;

export const completionEvidenceClassSchema = z.enum([
  "source",
  "unit",
  "fake_integration",
  "windows_guest",
  "hyperv_host_guest",
  "chatgpt_mcp",
  "owner_acceptance",
  "security_review",
  "release_operations",
]);
export type CompletionEvidenceClass = z.infer<typeof completionEvidenceClassSchema>;

export const completionStatusSchema = z.enum([
  "planned",
  "source_validated",
  "ready_for_live",
  "passed",
  "failed",
  "blocked",
]);
export type CompletionStatus = z.infer<typeof completionStatusSchema>;

export const completionEvidenceSchema = z.object({
  evidenceClass: completionEvidenceClassSchema,
  reference: z.string().min(1).max(500),
  exactCommit: z.string().regex(/^[a-f0-9]{40}$/).optional(),
  runReference: z.string().min(1).max(300).optional(),
  synthetic: z.boolean(),
  observedAt: z.string().datetime(),
}).strict();
export type CompletionEvidence = z.infer<typeof completionEvidenceSchema>;

export const completionTestSchema = z.object({
  id: z.string().regex(/^[A-Z]{2,5}-[0-9]{3}$/),
  phaseId: z.string().regex(/^[MP][0-9]+$/),
  title: z.string().min(1).max(240),
  capability: z.string().min(1).max(120),
  severity: z.enum(["critical", "high", "medium", "low"]),
  requiredFor: z.array(completionTargetSchema).min(1),
  requiredEvidenceClass: completionEvidenceClassSchema,
  status: completionStatusSchema,
  prerequisites: z.array(z.string().regex(/^[A-Z]{2,5}-[0-9]{3}$/)),
  acceptanceCriteria: z.array(z.string().min(1).max(500)).min(1),
  evidence: z.array(completionEvidenceSchema),
  rollbackOrContainment: z.string().min(1).max(1000),
  automatedCommand: z.string().min(1).max(500).optional(),
}).strict();
export type CompletionTest = z.infer<typeof completionTestSchema>;

export const completionPhaseSchema = z.object({
  id: z.string().regex(/^[MP][0-9]+$/),
  order: z.number().int().nonnegative(),
  name: z.string().min(1).max(160),
  objective: z.string().min(1).max(1000),
  dependencies: z.array(z.string().regex(/^[MP][0-9]+$/)),
  deliverables: z.array(z.string().min(1).max(500)).min(1),
  exitCriteria: z.array(z.string().min(1).max(500)).min(1),
}).strict();
export type CompletionPhase = z.infer<typeof completionPhaseSchema>;

export const buildCompletionManifestSchema = z.object({
  contractVersion: z.literal(1),
  generatedAt: z.string().datetime(),
  branch: z.string().min(1).max(200),
  baselineCommit: z.string().regex(/^[a-f0-9]{40}$/),
  productionDecision: z.literal("denied"),
  phases: z.array(completionPhaseSchema).min(1),
  tests: z.array(completionTestSchema).min(1),
  manifestHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type BuildCompletionManifest = z.infer<typeof buildCompletionManifestSchema>;

export const buildCompletionEvaluationSchema = z.object({
  contractVersion: z.literal(1),
  target: completionTargetSchema,
  evaluatedAt: z.string().datetime(),
  weightedCompletionPercent: z.number().finite().min(0).max(100),
  requiredTestCount: z.number().int().nonnegative(),
  passedTestCount: z.number().int().nonnegative(),
  sourceValidatedCount: z.number().int().nonnegative(),
  liveEvidenceRequiredCount: z.number().int().nonnegative(),
  phaseStates: z.array(z.object({
    phaseId: z.string(),
    complete: z.boolean(),
    blocked: z.boolean(),
    blockingTestIds: z.array(z.string()),
  }).strict()),
  nextPhaseIds: z.array(z.string()),
  blockingTestIds: z.array(z.string()),
  promotionAllowed: z.boolean(),
  productionAllowed: z.literal(false),
  resultHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type BuildCompletionEvaluation = z.infer<typeof buildCompletionEvaluationSchema>;

const evidenceRank: Record<CompletionEvidenceClass, number> = {
  source: 0,
  unit: 1,
  fake_integration: 2,
  windows_guest: 3,
  hyperv_host_guest: 4,
  chatgpt_mcp: 5,
  owner_acceptance: 6,
  security_review: 7,
  release_operations: 8,
};

const liveEvidenceClasses = new Set<CompletionEvidenceClass>([
  "windows_guest",
  "hyperv_host_guest",
  "chatgpt_mcp",
  "owner_acceptance",
  "security_review",
  "release_operations",
]);

const statusScore: Record<CompletionStatus, number> = {
  planned: 0,
  source_validated: 0.45,
  ready_for_live: 0.6,
  passed: 1,
  failed: 0,
  blocked: 0,
};

export function createBuildCompletionManifest(
  input: Omit<BuildCompletionManifest, "manifestHash">,
): BuildCompletionManifest {
  validateCompletionGraph(input.phases, input.tests);
  validateTestEvidence(input.tests);
  const core = structuredClone(input);
  return buildCompletionManifestSchema.parse({ ...core, manifestHash: sha256Canonical(core) });
}

export function verifyBuildCompletionManifest(raw: BuildCompletionManifest): boolean {
  const manifest = buildCompletionManifestSchema.parse(structuredClone(raw));
  const { manifestHash, ...core } = manifest;
  validateCompletionGraph(manifest.phases, manifest.tests);
  validateTestEvidence(manifest.tests);
  return sha256Canonical(core) === manifestHash;
}

export function evaluateBuildCompletion(
  raw: BuildCompletionManifest,
  target: CompletionTarget,
  evaluatedAt = new Date().toISOString(),
): BuildCompletionEvaluation {
  const manifest = buildCompletionManifestSchema.parse(structuredClone(raw));
  if (!verifyBuildCompletionManifest(manifest)) throw new Error("Build completion manifest integrity verification failed.");

  const requiredTests = manifest.tests.filter((test) => test.requiredFor.includes(target));
  const requiredIds = new Set(requiredTests.map((test) => test.id));
  const phaseMap = new Map(manifest.phases.map((phase) => [phase.id, phase]));
  const testsByPhase = new Map<string, CompletionTest[]>();
  for (const phase of manifest.phases) testsByPhase.set(phase.id, []);
  for (const test of requiredTests) testsByPhase.get(test.phaseId)?.push(test);

  const phaseCompletion = new Map<string, boolean>();
  const phaseStates = [...manifest.phases]
    .sort((a, b) => a.order - b.order)
    .map((phase) => {
      const tests = testsByPhase.get(phase.id) ?? [];
      const dependencyComplete = phase.dependencies.every((dependency) => phaseCompletion.get(dependency) === true);
      const blockingTestIds = tests.filter((test) => test.status !== "passed").map((test) => test.id);
      const complete = dependencyComplete && tests.length > 0 && blockingTestIds.length === 0;
      const blocked = !dependencyComplete || tests.some((test) => test.status === "blocked" || test.status === "failed");
      phaseCompletion.set(phase.id, complete);
      return { phaseId: phase.id, complete, blocked, blockingTestIds };
    });

  const weightedTotal = requiredTests.reduce((sum, test) => sum + severityWeight(test.severity), 0);
  const weightedEarned = requiredTests.reduce(
    (sum, test) => sum + severityWeight(test.severity) * statusScore[test.status],
    0,
  );
  const weightedCompletionPercent = weightedTotal === 0 ? 0 : round((weightedEarned / weightedTotal) * 100);
  const blockingTestIds = requiredTests.filter((test) => test.status !== "passed").map((test) => test.id);
  const nextPhaseIds = phaseStates
    .filter((state) => !state.complete)
    .filter((state) => {
      const phase = phaseMap.get(state.phaseId);
      return phase !== undefined && phase.dependencies.every((dependency) => phaseCompletion.get(dependency) === true);
    })
    .map((state) => state.phaseId)
    .slice(0, 2);

  const core = {
    contractVersion: 1 as const,
    target,
    evaluatedAt,
    weightedCompletionPercent,
    requiredTestCount: requiredTests.length,
    passedTestCount: requiredTests.filter((test) => test.status === "passed").length,
    sourceValidatedCount: requiredTests.filter((test) => test.status === "source_validated" || test.status === "ready_for_live").length,
    liveEvidenceRequiredCount: requiredTests.filter((test) => liveEvidenceClasses.has(test.requiredEvidenceClass)).length,
    phaseStates,
    nextPhaseIds,
    blockingTestIds,
    promotionAllowed: requiredTests.length > 0 && blockingTestIds.length === 0,
    productionAllowed: false as const,
  };
  return buildCompletionEvaluationSchema.parse({ ...core, resultHash: sha256Canonical(core) });
}

export function verifyBuildCompletionEvaluation(raw: BuildCompletionEvaluation): boolean {
  const result = buildCompletionEvaluationSchema.parse(structuredClone(raw));
  const { resultHash, ...core } = result;
  return sha256Canonical(core) === resultHash;
}

function validateCompletionGraph(phases: CompletionPhase[], tests: CompletionTest[]): void {
  const phaseIds = new Set<string>();
  const phaseOrders = new Set<number>();
  for (const phase of phases) {
    if (phaseIds.has(phase.id)) throw new Error(`Duplicate completion phase: ${phase.id}`);
    if (phaseOrders.has(phase.order)) throw new Error(`Duplicate completion phase order: ${phase.order}`);
    phaseIds.add(phase.id);
    phaseOrders.add(phase.order);
  }
  for (const phase of phases) {
    for (const dependency of phase.dependencies) {
      if (!phaseIds.has(dependency)) throw new Error(`Unknown phase dependency ${dependency} for ${phase.id}`);
      if (dependency === phase.id) throw new Error(`Completion phase ${phase.id} cannot depend on itself.`);
    }
  }
  detectPhaseCycles(phases);

  const testIds = new Set<string>();
  for (const test of tests) {
    if (testIds.has(test.id)) throw new Error(`Duplicate completion test: ${test.id}`);
    if (!phaseIds.has(test.phaseId)) throw new Error(`Unknown completion phase ${test.phaseId} for test ${test.id}`);
    testIds.add(test.id);
  }
  for (const test of tests) {
    for (const prerequisite of test.prerequisites) {
      if (!testIds.has(prerequisite)) throw new Error(`Unknown test prerequisite ${prerequisite} for ${test.id}`);
      if (prerequisite === test.id) throw new Error(`Completion test ${test.id} cannot depend on itself.`);
    }
  }
  for (const phase of phases) {
    if (!tests.some((test) => test.phaseId === phase.id)) throw new Error(`Completion phase ${phase.id} has no tests.`);
  }
}

function validateTestEvidence(tests: CompletionTest[]): void {
  for (const test of tests) {
    const qualifyingEvidence = test.evidence.filter(
      (evidence) => evidenceRank[evidence.evidenceClass] >= evidenceRank[test.requiredEvidenceClass],
    );
    if (test.status === "passed" && qualifyingEvidence.length === 0) {
      throw new Error(`Passed completion test ${test.id} lacks qualifying evidence.`);
    }
    if (test.status === "passed" && liveEvidenceClasses.has(test.requiredEvidenceClass)) {
      if (qualifyingEvidence.every((evidence) => evidence.synthetic)) {
        throw new Error(`Live completion test ${test.id} cannot pass with synthetic-only evidence.`);
      }
      if (qualifyingEvidence.some((evidence) => !evidence.exactCommit || !evidence.runReference)) {
        throw new Error(`Live completion test ${test.id} requires exact-commit and run references.`);
      }
    }
    if ((test.status === "source_validated" || test.status === "ready_for_live") && test.evidence.length === 0) {
      throw new Error(`${test.status} completion test ${test.id} requires evidence.`);
    }
  }
}

function detectPhaseCycles(phases: CompletionPhase[]): void {
  const map = new Map(phases.map((phase) => [phase.id, phase.dependencies]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (phaseId: string): void => {
    if (visiting.has(phaseId)) throw new Error(`Completion phase dependency cycle detected at ${phaseId}.`);
    if (visited.has(phaseId)) return;
    visiting.add(phaseId);
    for (const dependency of map.get(phaseId) ?? []) visit(dependency);
    visiting.delete(phaseId);
    visited.add(phaseId);
  };
  for (const phase of phases) visit(phase.id);
}

function severityWeight(severity: CompletionTest["severity"]): number {
  if (severity === "critical") return 5;
  if (severity === "high") return 3;
  if (severity === "medium") return 2;
  return 1;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
