import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { brainRouteDecisionSchema, type BrainRouteDecision } from "./brainRouting.js";
import { sha256Canonical } from "./fieldContracts.js";

export const productTaskRiskSchema = z.enum(["info", "low", "medium", "high", "consequential"]);
export type ProductTaskRisk = z.infer<typeof productTaskRiskSchema>;

export const productApprovalClassSchema = z.enum(["automatic", "grouped", "immediate"]);
export type ProductApprovalClass = z.infer<typeof productApprovalClassSchema>;

export const productTaskStepKindSchema = z.enum([
  "observe",
  "navigate",
  "collect",
  "draft",
  "fill",
  "organize",
  "download",
  "external_commit",
]);
export type ProductTaskStepKind = z.infer<typeof productTaskStepKindSchema>;

export const productTaskStepSchema = z.object({
  stepKey: z.string().min(1).max(200),
  kind: productTaskStepKindSchema,
  intent: z.string().min(1).max(2_000),
  expectedResult: z.string().min(1).max(2_000),
  risk: productTaskRiskSchema,
  reversible: z.boolean(),
  externalEffect: z.boolean(),
  finalSubmission: z.boolean(),
  usesCredentials: z.boolean(),
  identitySensitive: z.boolean(),
  financialOrLegal: z.boolean(),
  destructive: z.boolean(),
  humanVerification: z.boolean(),
  verificationRequired: z.literal(true),
}).strict();
export type ProductTaskStep = z.infer<typeof productTaskStepSchema>;

export const productTaskRecipeSchema = z.object({
  contractVersion: z.literal(1),
  recipeId: z.string().min(1).max(200),
  version: z.number().int().positive(),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(2_000),
  supportedVariables: z.array(z.string().min(1).max(100)).max(50),
  steps: z.array(productTaskStepSchema).min(1).max(100),
  pilotEligible: z.literal(false),
}).strict().superRefine((recipe, context) => {
  const keys = new Set<string>();
  for (const [index, step] of recipe.steps.entries()) {
    if (keys.has(step.stepKey)) {
      context.addIssue({ code: "custom", path: ["steps", index, "stepKey"], message: "Recipe step keys must be unique." });
    }
    keys.add(step.stepKey);
  }
});
export type ProductTaskRecipe = z.infer<typeof productTaskRecipeSchema>;

export const productTaskStepRecordSchema = z.object({
  step: productTaskStepSchema,
  approvalClass: productApprovalClassSchema,
  status: z.enum([
    "pending",
    "ready",
    "running",
    "waiting_approval",
    "verified",
    "retryable",
    "needs_owner",
    "safely_aborted",
    "rolled_back",
    "cancelled",
  ]),
  attempts: z.number().int().nonnegative().max(100),
  lastSummary: z.string().max(2_000).optional(),
  lastEvidenceHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  completedAt: z.string().datetime().optional(),
}).strict();
export type ProductTaskStepRecord = z.infer<typeof productTaskStepRecordSchema>;

export const productTaskSessionSchema = z.object({
  contractVersion: z.literal(1),
  taskId: z.string().uuid(),
  recipeId: z.string().min(1).max(200),
  recipeVersion: z.number().int().positive(),
  requestedBy: z.string().min(1).max(300),
  goal: z.string().min(1).max(4_000),
  variables: z.record(z.string(), z.string().max(4_000)),
  brain: brainRouteDecisionSchema,
  status: z.enum([
    "created",
    "running",
    "waiting_approval",
    "paused",
    "recovery_required",
    "completed",
    "failed",
    "cancelled",
  ]),
  fieldRequired: z.literal(true),
  fieldReady: z.boolean(),
  currentStepIndex: z.number().int().nonnegative(),
  checkpointVersion: z.number().int().nonnegative(),
  maximumAutomaticRetryCount: z.literal(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  pauseReason: z.string().max(2_000).optional(),
  steps: z.array(productTaskStepRecordSchema).min(1).max(100),
  actionAuthority: z.literal("none"),
  executionAllowed: z.literal(false),
  taskHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type ProductTaskSession = z.infer<typeof productTaskSessionSchema>;

export const productTaskChunkSchema = z.object({
  contractVersion: z.literal(1),
  chunkId: z.string().uuid(),
  taskId: z.string().uuid(),
  taskHash: z.string().regex(/^[a-f0-9]{64}$/),
  checkpointVersion: z.number().int().nonnegative(),
  approvalClass: productApprovalClassSchema,
  ownerApprovalRequired: z.boolean(),
  steps: z.array(z.object({
    stepIndex: z.number().int().nonnegative(),
    step: productTaskStepSchema,
  }).strict()).min(1).max(10),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  downstreamMustReobserve: z.literal(true),
  downstreamMustVerifyEachStep: z.literal(true),
  downstreamMustUseOrdinaryPolicy: z.literal(true),
  executionAllowed: z.literal(false),
  actionAuthority: z.literal("none"),
  chunkHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type ProductTaskChunk = z.infer<typeof productTaskChunkSchema>;

export const trustedTaskOutcomeSchema = z.object({
  chunk: productTaskChunkSchema,
  trustedLocalAdapter: z.literal(true),
  outcome: z.enum(["verified", "retryable", "needs_owner", "safely_aborted", "rolled_back"]),
  completedStepIndexes: z.array(z.number().int().nonnegative()).max(10),
  summary: z.string().min(1).max(2_000),
  evidenceHash: z.string().regex(/^[a-f0-9]{64}$/),
  recordedAt: z.string().datetime().optional(),
}).strict();
export type TrustedTaskOutcome = z.infer<typeof trustedTaskOutcomeSchema>;

export interface ProductTaskStore {
  save(task: ProductTaskSession): Promise<void>;
  load(taskId: string): Promise<ProductTaskSession | undefined>;
  list(): Promise<string[]>;
  delete(taskId: string): Promise<void>;
}

export class InMemoryProductTaskStore implements ProductTaskStore {
  readonly #items = new Map<string, ProductTaskSession>();

  async save(task: ProductTaskSession): Promise<void> {
    const verified = verifyTask(task);
    this.#items.set(verified.taskId, structuredClone(verified));
  }

  async load(taskId: string): Promise<ProductTaskSession | undefined> {
    const task = this.#items.get(taskId);
    return task ? structuredClone(verifyTask(task)) : undefined;
  }

  async list(): Promise<string[]> {
    return [...this.#items.keys()].sort();
  }

  async delete(taskId: string): Promise<void> {
    this.#items.delete(taskId);
  }
}

export class FileProductTaskStore implements ProductTaskStore {
  readonly #directory: string;
  readonly #maximumBytes: number;

  constructor(options: { directory: string; maximumBytes?: number }) {
    this.#directory = options.directory;
    this.#maximumBytes = options.maximumBytes ?? 5 * 1024 * 1024;
    if (!Number.isInteger(this.#maximumBytes) || this.#maximumBytes < 1_024 || this.#maximumBytes > 100 * 1024 * 1024) {
      throw new Error("maximumBytes must be between 1024 and 104857600.");
    }
  }

  async save(task: ProductTaskSession): Promise<void> {
    const verified = verifyTask(task);
    const serialized = JSON.stringify(verified);
    if (Buffer.byteLength(serialized, "utf8") > this.#maximumBytes) throw new Error("Product task checkpoint exceeds the configured size limit.");
    await mkdir(this.#directory, { recursive: true });
    const destination = this.#path(verified.taskId);
    const temporary = `${destination}.${randomUUID()}.tmp`;
    await writeFile(temporary, serialized, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, destination);
  }

  async load(taskId: string): Promise<ProductTaskSession | undefined> {
    const file = this.#path(taskId);
    try {
      const metadata = await stat(file);
      if (metadata.size > this.#maximumBytes) throw new Error("Product task checkpoint exceeds the configured size limit.");
      const parsed: unknown = JSON.parse(await readFile(file, "utf8"));
      const task = verifyTask(productTaskSessionSchema.parse(parsed));
      if (task.taskId !== taskId) throw new Error("Product task checkpoint identity does not match its requested task.");
      return task;
    } catch (error: unknown) {
      if (isMissingFile(error)) return undefined;
      throw error;
    }
  }

  async list(): Promise<string[]> {
    try {
      const names = await readdir(this.#directory);
      const ids: string[] = [];
      for (const name of names.filter((candidate) => candidate.endsWith(".task.json")).sort()) {
        const file = path.join(this.#directory, name);
        try {
          const metadata = await stat(file);
          if (metadata.size > this.#maximumBytes) continue;
          const parsed: unknown = JSON.parse(await readFile(file, "utf8"));
          const task = verifyTask(productTaskSessionSchema.parse(parsed));
          if (this.#path(task.taskId) === file) ids.push(task.taskId);
        } catch {
          // Invalid or tampered checkpoints are excluded from discovery.
        }
      }
      return ids.sort();
    } catch (error: unknown) {
      if (isMissingFile(error)) return [];
      throw error;
    }
  }

  async delete(taskId: string): Promise<void> {
    try {
      await unlink(this.#path(taskId));
    } catch (error: unknown) {
      if (!isMissingFile(error)) throw error;
    }
  }

  #path(taskId: string): string {
    const fingerprint = createHash("sha256").update(taskId, "utf8").digest("hex");
    return path.join(this.#directory, `${fingerprint}.task.json`);
  }
}

export class ProductTaskRecipeRegistry {
  readonly #recipes = new Map<string, ProductTaskRecipe>();

  constructor(recipes: ProductTaskRecipe[] = BUILT_IN_PRODUCT_RECIPES) {
    for (const recipe of recipes) this.register(recipe);
  }

  register(raw: ProductTaskRecipe): ProductTaskRecipe {
    const recipe = productTaskRecipeSchema.parse(structuredClone(raw));
    const existing = this.#recipes.get(recipe.recipeId);
    if (existing && existing.version >= recipe.version) throw new Error("Recipe versions must increase.");
    this.#recipes.set(recipe.recipeId, recipe);
    return structuredClone(recipe);
  }

  get(recipeId: string): ProductTaskRecipe {
    const recipe = this.#recipes.get(recipeId);
    if (!recipe) throw new Error(`Recipe ${recipeId} was not found.`);
    return structuredClone(recipe);
  }

  list(): ProductTaskRecipe[] {
    return [...this.#recipes.values()].sort((a, b) => a.recipeId.localeCompare(b.recipeId)).map((recipe) => structuredClone(recipe));
  }
}

export class PersonalTaskController {
  readonly #store: ProductTaskStore;
  readonly #recipes: ProductTaskRecipeRegistry;
  readonly #tasks = new Map<string, ProductTaskSession>();

  constructor(options: { store?: ProductTaskStore; recipes?: ProductTaskRecipeRegistry } = {}) {
    this.#store = options.store ?? new InMemoryProductTaskStore();
    this.#recipes = options.recipes ?? new ProductTaskRecipeRegistry();
  }

  async hydrate(): Promise<number> {
    let loaded = 0;
    for (const taskId of await this.#store.list()) {
      const task = await this.#store.load(taskId);
      if (!task) continue;
      this.#tasks.set(taskId, task);
      loaded += 1;
    }
    return loaded;
  }

  listRecipes(): ProductTaskRecipe[] {
    return this.#recipes.list();
  }

  async create(input: {
    recipeId: string;
    requestedBy: string;
    goal: string;
    variables?: Record<string, string>;
    brain: BrainRouteDecision;
    taskId?: string;
    createdAt?: string;
  }): Promise<ProductTaskSession> {
    const recipe = this.#recipes.get(input.recipeId);
    const brain = brainRouteDecisionSchema.parse(structuredClone(input.brain));
    if (brain.provider === "none" || brain.status !== "selected") throw new Error("A selected brain route is required before creating a product task.");
    const variables = z.record(z.string(), z.string().max(4_000)).parse(input.variables ?? {});
    for (const variable of Object.keys(variables)) {
      if (!recipe.supportedVariables.includes(variable)) throw new Error(`Recipe ${recipe.recipeId} does not support variable ${variable}.`);
    }
    const createdAt = input.createdAt ?? new Date().toISOString();
    const core = {
      contractVersion: 1 as const,
      taskId: input.taskId ?? randomUUID(),
      recipeId: recipe.recipeId,
      recipeVersion: recipe.version,
      requestedBy: input.requestedBy,
      goal: input.goal,
      variables,
      brain,
      status: "created" as const,
      fieldRequired: true as const,
      fieldReady: false,
      currentStepIndex: 0,
      checkpointVersion: 0,
      maximumAutomaticRetryCount: 1 as const,
      createdAt,
      updatedAt: createdAt,
      steps: recipe.steps.map((step, index) => ({
        step,
        approvalClass: classifyProductApproval(step),
        status: index === 0 ? "ready" as const : "pending" as const,
        attempts: 0,
      })),
      actionAuthority: "none" as const,
      executionAllowed: false as const,
    };
    const task = signTask(core);
    if (this.#tasks.has(task.taskId)) throw new Error("Product task IDs must be unique.");
    this.#tasks.set(task.taskId, task);
    await this.#store.save(task);
    return structuredClone(task);
  }

  list(): ProductTaskSession[] {
    return [...this.#tasks.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((task) => structuredClone(verifyTask(task)));
  }

  get(taskId: string): ProductTaskSession {
    return structuredClone(verifyTask(this.#require(taskId)));
  }

  async start(taskId: string, fieldReady: boolean): Promise<ProductTaskSession> {
    const task = this.#mutable(taskId);
    if (task.status !== "created" && task.status !== "paused") throw new Error(`Task ${taskId} cannot start from ${task.status}.`);
    if (!fieldReady) throw new Error("The Field must be ready before a product task can start.");
    task.fieldReady = true;
    task.status = "running";
    delete task.pauseReason;
    return this.#commit(task);
  }

  planNextChunk(taskId: string, options: { maximumSteps?: number; ttlMs?: number; createdAt?: string } = {}): ProductTaskChunk {
    const task = verifyTask(this.#require(taskId));
    if (task.status !== "running" && task.status !== "waiting_approval") throw new Error(`Task ${taskId} cannot plan while ${task.status}.`);
    const maximumSteps = options.maximumSteps ?? 5;
    if (!Number.isInteger(maximumSteps) || maximumSteps < 1 || maximumSteps > 10) throw new Error("maximumSteps must be between 1 and 10.");
    const start = task.currentStepIndex;
    const first = task.steps[start];
    if (!first) throw new Error("The product task has no remaining step.");
    if (!["ready", "retryable", "waiting_approval"].includes(first.status)) throw new Error(`Current step is not plannable from ${first.status}.`);
    const approvalClass = first.approvalClass;
    const selected: Array<{ stepIndex: number; step: ProductTaskStep }> = [];
    for (let index = start; index < task.steps.length && selected.length < maximumSteps; index += 1) {
      const record = task.steps[index];
      if (!record || record.approvalClass !== approvalClass) break;
      if (approvalClass === "immediate" && selected.length > 0) break;
      if (!['pending', 'ready', 'retryable', 'waiting_approval'].includes(record.status)) break;
      selected.push({ stepIndex: index, step: structuredClone(record.step) });
      if (approvalClass === "immediate") break;
    }
    const createdAt = options.createdAt ?? new Date().toISOString();
    const ttlMs = options.ttlMs ?? 5 * 60_000;
    if (!Number.isInteger(ttlMs) || ttlMs < 1_000 || ttlMs > 15 * 60_000) throw new Error("Task chunk ttlMs must be between 1000 and 900000.");
    const core = {
      contractVersion: 1 as const,
      chunkId: randomUUID(),
      taskId: task.taskId,
      taskHash: task.taskHash,
      checkpointVersion: task.checkpointVersion,
      approvalClass,
      ownerApprovalRequired: approvalClass !== "automatic",
      steps: selected,
      createdAt,
      expiresAt: new Date(new Date(createdAt).getTime() + ttlMs).toISOString(),
      downstreamMustReobserve: true as const,
      downstreamMustVerifyEachStep: true as const,
      downstreamMustUseOrdinaryPolicy: true as const,
      executionAllowed: false as const,
      actionAuthority: "none" as const,
    };
    return signChunk(core);
  }

  async recordTrustedOutcome(raw: TrustedTaskOutcome): Promise<ProductTaskSession> {
    const input = trustedTaskOutcomeSchema.parse(structuredClone(raw));
    const chunk = verifyChunk(input.chunk);
    const task = this.#mutable(chunk.taskId);
    if (task.taskHash !== chunk.taskHash || task.checkpointVersion !== chunk.checkpointVersion) throw new Error("Task chunk is stale.");
    if (new Date(input.recordedAt ?? new Date().toISOString()).getTime() > new Date(chunk.expiresAt).getTime()) throw new Error("Task chunk expired before outcome recording.");
    if (input.completedStepIndexes.some((index) => !chunk.steps.some((item) => item.stepIndex === index))) throw new Error("Outcome references a step outside the task chunk.");

    for (const item of chunk.steps) {
      const record = task.steps[item.stepIndex];
      if (!record) throw new Error("Task chunk references a missing task step.");
      if (input.completedStepIndexes.includes(item.stepIndex) && input.outcome === "verified") {
        record.status = "verified";
        record.attempts += 1;
        record.lastSummary = input.summary;
        record.lastEvidenceHash = input.evidenceHash;
        record.completedAt = input.recordedAt ?? new Date().toISOString();
      } else if (item.stepIndex === task.currentStepIndex) {
        record.attempts += 1;
        record.status = input.outcome;
        record.lastSummary = input.summary;
        record.lastEvidenceHash = input.evidenceHash;
      }
    }

    if (input.outcome === "verified") {
      while (task.currentStepIndex < task.steps.length && task.steps[task.currentStepIndex]?.status === "verified") task.currentStepIndex += 1;
      if (task.currentStepIndex >= task.steps.length) {
        task.status = "completed";
      } else {
        const next = task.steps[task.currentStepIndex];
        if (next) next.status = "ready";
        task.status = "running";
      }
    } else if (input.outcome === "retryable") {
      const current = task.steps[task.currentStepIndex];
      task.status = current && current.attempts <= task.maximumAutomaticRetryCount ? "running" : "recovery_required";
      if (task.status === "recovery_required") task.pauseReason = "automatic_retry_budget_exhausted";
    } else if (input.outcome === "needs_owner") {
      task.status = "waiting_approval";
      const current = task.steps[task.currentStepIndex];
      if (current) current.status = "waiting_approval";
    } else if (input.outcome === "rolled_back") {
      task.status = "paused";
      task.pauseReason = "rolled_back_to_safe_checkpoint";
    } else {
      task.status = "failed";
      task.pauseReason = "safely_aborted";
    }
    task.checkpointVersion += 1;
    return this.#commit(task);
  }

  async pause(taskId: string, reason: string): Promise<ProductTaskSession> {
    if (!reason.trim()) throw new Error("Pause reason is required.");
    const task = this.#mutable(taskId);
    if (["completed", "failed", "cancelled"].includes(task.status)) throw new Error(`Task ${taskId} is already terminal.`);
    task.status = "paused";
    task.pauseReason = reason;
    task.checkpointVersion += 1;
    return this.#commit(task);
  }

  async resume(taskId: string, fieldReady: boolean): Promise<ProductTaskSession> {
    const task = this.#mutable(taskId);
    if (!["paused", "waiting_approval", "recovery_required"].includes(task.status)) throw new Error(`Task ${taskId} is not resumable from ${task.status}.`);
    if (!fieldReady) throw new Error("The Field must be ready before a product task can resume.");
    const current = task.steps[task.currentStepIndex];
    if (current?.status === "needs_owner" || current?.status === "waiting_approval") throw new Error("Owner-required state must be resolved before resume.");
    task.fieldReady = true;
    task.status = "running";
    delete task.pauseReason;
    task.checkpointVersion += 1;
    if (current && current.status !== "verified") current.status = current.status === "retryable" ? "retryable" : "ready";
    return this.#commit(task);
  }

  async cancel(taskId: string, reason: string): Promise<ProductTaskSession> {
    if (!reason.trim()) throw new Error("Cancellation reason is required.");
    const task = this.#mutable(taskId);
    if (["completed", "failed", "cancelled"].includes(task.status)) return structuredClone(task);
    task.status = "cancelled";
    task.pauseReason = reason;
    task.checkpointVersion += 1;
    for (const record of task.steps) {
      if (!["verified", "safely_aborted", "rolled_back"].includes(record.status)) record.status = "cancelled";
    }
    return this.#commit(task);
  }

  #require(taskId: string): ProductTaskSession {
    const task = this.#tasks.get(taskId);
    if (!task) throw new Error(`Product task ${taskId} was not found.`);
    return task;
  }

  #mutable(taskId: string): ProductTaskSession {
    return structuredClone(verifyTask(this.#require(taskId)));
  }

  async #commit(task: ProductTaskSession): Promise<ProductTaskSession> {
    const { taskHash: _taskHash, ...core } = task;
    const updated = signTask({ ...core, updatedAt: new Date().toISOString() });
    this.#tasks.set(updated.taskId, updated);
    await this.#store.save(updated);
    return structuredClone(updated);
  }
}

export function classifyProductApproval(raw: ProductTaskStep): ProductApprovalClass {
  const step = productTaskStepSchema.parse(raw);
  if (
    step.risk === "high" ||
    step.risk === "consequential" ||
    step.externalEffect ||
    step.finalSubmission ||
    step.usesCredentials ||
    step.identitySensitive ||
    step.financialOrLegal ||
    step.destructive ||
    step.humanVerification ||
    step.kind === "external_commit"
  ) return "immediate";
  if (step.risk === "medium" || !step.reversible || ["fill", "organize", "download"].includes(step.kind)) return "grouped";
  return "automatic";
}

function signTask(core: Omit<ProductTaskSession, "taskHash">): ProductTaskSession {
  return productTaskSessionSchema.parse({ ...core, taskHash: sha256Canonical(core) });
}

function verifyTask(raw: ProductTaskSession): ProductTaskSession {
  const task = productTaskSessionSchema.parse(structuredClone(raw));
  const { taskHash, ...core } = task;
  if (sha256Canonical(core) !== taskHash) throw new Error("Product task integrity verification failed.");
  return task;
}

function signChunk(core: Omit<ProductTaskChunk, "chunkHash">): ProductTaskChunk {
  return productTaskChunkSchema.parse({ ...core, chunkHash: sha256Canonical(core) });
}

function verifyChunk(raw: ProductTaskChunk): ProductTaskChunk {
  const chunk = productTaskChunkSchema.parse(structuredClone(raw));
  const { chunkHash, ...core } = chunk;
  if (sha256Canonical(core) !== chunkHash) throw new Error("Product task chunk integrity verification failed.");
  return chunk;
}

function isMissingFile(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "ENOENT";
}

function step(input: Omit<ProductTaskStep, "verificationRequired">): ProductTaskStep {
  return productTaskStepSchema.parse({ ...input, verificationRequired: true });
}

export const BUILT_IN_PRODUCT_RECIPES: ProductTaskRecipe[] = [
  productTaskRecipeSchema.parse({
    contractVersion: 1,
    recipeId: "gather-approved-information",
    version: 1,
    title: "Gather approved information",
    description: "Open approved applications, collect requested information, and produce a local result without an external commitment.",
    supportedVariables: ["sources", "query", "outputFormat"],
    pilotEligible: false,
    steps: [
      step({ stepKey: "observe", kind: "observe", intent: "Observe the approved workspace and confirm required applications are available.", expectedResult: "A fresh privacy-safe workspace scene is available.", risk: "info", reversible: true, externalEffect: false, finalSubmission: false, usesCredentials: false, identitySensitive: false, financialOrLegal: false, destructive: false, humanVerification: false }),
      step({ stepKey: "collect", kind: "collect", intent: "Collect the requested information from approved sources.", expectedResult: "Requested information is captured as local task artifacts.", risk: "low", reversible: true, externalEffect: false, finalSubmission: false, usesCredentials: false, identitySensitive: false, financialOrLegal: false, destructive: false, humanVerification: false }),
      step({ stepKey: "summarize", kind: "draft", intent: "Prepare a local summary and evidence index.", expectedResult: "A local summary is ready for owner review.", risk: "low", reversible: true, externalEffect: false, finalSubmission: false, usesCredentials: false, identitySensitive: false, financialOrLegal: false, destructive: false, humanVerification: false }),
    ],
  }),
  productTaskRecipeSchema.parse({
    contractVersion: 1,
    recipeId: "research-normalize-organize",
    version: 1,
    title: "Research, normalize, and organize",
    description: "Gather approved research, normalize comparable fields, remove duplicates, and create a local comparison artifact.",
    supportedVariables: ["topic", "sources", "comparisonFields", "outputFormat"],
    pilotEligible: false,
    steps: [
      step({ stepKey: "research", kind: "collect", intent: "Collect research from approved sources.", expectedResult: "Source-backed records are available locally.", risk: "low", reversible: true, externalEffect: false, finalSubmission: false, usesCredentials: false, identitySensitive: false, financialOrLegal: false, destructive: false, humanVerification: false }),
      step({ stepKey: "normalize", kind: "organize", intent: "Normalize requested fields and identify duplicate records.", expectedResult: "A normalized, deduplicated local dataset is ready.", risk: "low", reversible: true, externalEffect: false, finalSubmission: false, usesCredentials: false, identitySensitive: false, financialOrLegal: false, destructive: false, humanVerification: false }),
      step({ stepKey: "comparison", kind: "draft", intent: "Create a local comparison artifact with sources and caveats.", expectedResult: "A reviewable local comparison artifact exists.", risk: "low", reversible: true, externalEffect: false, finalSubmission: false, usesCredentials: false, identitySensitive: false, financialOrLegal: false, destructive: false, humanVerification: false }),
    ],
  }),
  productTaskRecipeSchema.parse({
    contractVersion: 1,
    recipeId: "fill-form-stop-before-submit",
    version: 1,
    title: "Fill a form and stop before submission",
    description: "Populate approved non-sensitive fields, verify the draft, and stop before the final submission action.",
    supportedVariables: ["form", "fieldValues", "sourceArtifact"],
    pilotEligible: false,
    steps: [
      step({ stepKey: "observe-form", kind: "observe", intent: "Observe the form and identify approved fields without entering protected data.", expectedResult: "A fresh form scene and field plan are available.", risk: "info", reversible: true, externalEffect: false, finalSubmission: false, usesCredentials: false, identitySensitive: false, financialOrLegal: false, destructive: false, humanVerification: false }),
      step({ stepKey: "fill-fields", kind: "fill", intent: "Fill approved non-sensitive fields without submitting the form.", expectedResult: "The form is populated but remains unsubmitted.", risk: "medium", reversible: true, externalEffect: false, finalSubmission: false, usesCredentials: false, identitySensitive: false, financialOrLegal: false, destructive: false, humanVerification: false }),
      step({ stepKey: "review-draft", kind: "observe", intent: "Verify populated values and surface discrepancies to the owner.", expectedResult: "The draft is verified and awaiting explicit submission instructions.", risk: "low", reversible: true, externalEffect: false, finalSubmission: false, usesCredentials: false, identitySensitive: false, financialOrLegal: false, destructive: false, humanVerification: false }),
    ],
  }),
  productTaskRecipeSchema.parse({
    contractVersion: 1,
    recipeId: "prepare-message-stop-before-send",
    version: 1,
    title: "Prepare a message and stop before sending",
    description: "Prepare and review a message locally or in an approved draft surface without sending it.",
    supportedVariables: ["recipientContext", "purpose", "sourceMaterial", "tone"],
    pilotEligible: false,
    steps: [
      step({ stepKey: "gather-context", kind: "collect", intent: "Gather approved context required to prepare the message.", expectedResult: "Relevant context is available as local artifacts.", risk: "low", reversible: true, externalEffect: false, finalSubmission: false, usesCredentials: false, identitySensitive: false, financialOrLegal: false, destructive: false, humanVerification: false }),
      step({ stepKey: "draft-message", kind: "draft", intent: "Prepare the message using the active owner-approved language model profile.", expectedResult: "A local draft is ready for owner review.", risk: "low", reversible: true, externalEffect: false, finalSubmission: false, usesCredentials: false, identitySensitive: false, financialOrLegal: false, destructive: false, humanVerification: false }),
      step({ stepKey: "place-draft", kind: "fill", intent: "Place the approved draft into the designated composition surface without sending.", expectedResult: "The message remains an unsent draft.", risk: "medium", reversible: true, externalEffect: false, finalSubmission: false, usesCredentials: false, identitySensitive: true, financialOrLegal: false, destructive: false, humanVerification: false }),
    ],
  }),
  productTaskRecipeSchema.parse({
    contractVersion: 1,
    recipeId: "download-and-organize-approved-files",
    version: 1,
    title: "Download and organize approved files",
    description: "Download owner-approved files, verify them, and organize them reversibly within an approved local scope.",
    supportedVariables: ["downloadList", "destination", "namingConvention", "classification"],
    pilotEligible: false,
    steps: [
      step({ stepKey: "download", kind: "download", intent: "Download only the owner-approved file set.", expectedResult: "Approved files are present in the temporary download scope.", risk: "medium", reversible: true, externalEffect: false, finalSubmission: false, usesCredentials: false, identitySensitive: false, financialOrLegal: false, destructive: false, humanVerification: false }),
      step({ stepKey: "verify-files", kind: "observe", intent: "Verify file identities, sizes, and expected checks before organization.", expectedResult: "Downloaded files have verification evidence.", risk: "low", reversible: true, externalEffect: false, finalSubmission: false, usesCredentials: false, identitySensitive: false, financialOrLegal: false, destructive: false, humanVerification: false }),
      step({ stepKey: "organize-files", kind: "organize", intent: "Rename and organize verified files inside the approved destination.", expectedResult: "Files are organized reversibly with an operation manifest.", risk: "medium", reversible: true, externalEffect: false, finalSubmission: false, usesCredentials: false, identitySensitive: false, financialOrLegal: false, destructive: false, humanVerification: false }),
    ],
  }),
];
