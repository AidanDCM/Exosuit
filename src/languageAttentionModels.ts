import { z } from "zod";
import { sha256Canonical } from "./fieldContracts.js";
import { personaBehaviorPlanSchema, type PersonaBehaviorPlan } from "./personaBehavior.js";

const unitIntervalSchema = z.number().finite().min(0).max(1);
const MODEL_VERSION = "language-attention-v1" as const;

export const languageStyleObservationSchema = z.object({
  observationId: z.string().uuid(),
  sourceEpisodeId: z.string().uuid(),
  observedAt: z.string().datetime(),
  consented: z.literal(true),
  identitySensitive: z.literal(false),
  externallyPublished: z.literal(false),
  protectedContent: z.literal(false),
  wordCount: z.number().int().min(20).max(100_000),
  sentenceCount: z.number().int().positive().max(20_000),
  paragraphCount: z.number().int().positive().max(10_000),
  averageSentenceWords: z.number().finite().positive().max(1_000),
  contractionRate: unitIntervalSchema,
  firstPersonRate: unitIntervalSchema,
  exclamationRate: unitIntervalSchema,
  questionRate: unitIntervalSchema,
  emojiRate: unitIntervalSchema,
  uppercaseWordRate: unitIntervalSchema,
  vocabularyDiversity: unitIntervalSchema,
  sourceTextRetained: z.literal(false),
}).strict();
export type LanguageStyleObservation = z.infer<typeof languageStyleObservationSchema>;

export const languageStyleModelSchema = z.object({
  contractVersion: z.literal(1),
  modelVersion: z.literal(MODEL_VERSION),
  ownerId: z.string().min(1).max(200),
  profileId: z.string().uuid(),
  profileVersion: z.number().int().positive(),
  trainedAt: z.string().datetime(),
  sourceEpisodeIds: z.array(z.string().uuid()).min(2).max(10_000),
  observationCount: z.number().int().min(5),
  averageSentenceWords: z.number().finite().positive(),
  averageParagraphSentences: z.number().finite().positive(),
  contractionRate: unitIntervalSchema,
  firstPersonRate: unitIntervalSchema,
  exclamationRate: unitIntervalSchema,
  questionRate: unitIntervalSchema,
  emojiRate: unitIntervalSchema,
  uppercaseWordRate: unitIntervalSchema,
  vocabularyDiversity: unitIntervalSchema,
  rawTextRetained: z.literal(false),
  generatesText: z.literal(false),
  actionAuthority: z.literal("none"),
  modelHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type LanguageStyleModel = z.infer<typeof languageStyleModelSchema>;

export const languageStyleAdviceSchema = z.object({
  modelHash: z.string().regex(/^[a-f0-9]{64}$/),
  contextId: z.string().min(1).max(200),
  targetSentenceWords: z.object({ minimum: z.number().int().positive(), maximum: z.number().int().positive() }),
  targetParagraphSentences: z.object({ minimum: z.number().int().positive(), maximum: z.number().int().positive() }),
  contractionPreference: z.enum(["avoid", "neutral", "prefer"]),
  questionPreference: z.enum(["low", "moderate", "high"]),
  expressivePunctuationPreference: z.enum(["low", "moderate", "high"]),
  disclosureRequired: z.boolean(),
  generatesText: z.literal(false),
  representsHumanAuthorship: z.literal(false),
  actionAuthority: z.literal("none"),
}).strict();
export type LanguageStyleAdvice = z.infer<typeof languageStyleAdviceSchema>;

export const attentionObservationSchema = z.object({
  observationId: z.string().uuid(),
  sourceEpisodeId: z.string().uuid(),
  observedAt: z.string().datetime(),
  consented: z.literal(true),
  contentCharacters: z.number().int().nonnegative().max(1_000_000),
  dwellMs: z.number().finite().nonnegative().max(3_600_000),
  rereadCount: z.number().int().nonnegative().max(1_000),
  scrollReversalCount: z.number().int().nonnegative().max(10_000),
  focusSwitchCount: z.number().int().nonnegative().max(10_000),
  verificationEventCount: z.number().int().nonnegative().max(10_000),
  finalVerificationPerformed: z.boolean(),
  taskCompletedCorrectly: z.literal(true),
  protectedContentCaptured: z.literal(false),
}).strict();
export type AttentionObservation = z.infer<typeof attentionObservationSchema>;

export const attentionVerificationModelSchema = z.object({
  contractVersion: z.literal(1),
  modelVersion: z.literal(MODEL_VERSION),
  ownerId: z.string().min(1).max(200),
  profileId: z.string().uuid(),
  profileVersion: z.number().int().positive(),
  trainedAt: z.string().datetime(),
  sourceEpisodeIds: z.array(z.string().uuid()).min(2).max(10_000),
  observationCount: z.number().int().min(5),
  dwellMsPer100Characters: z.number().finite().nonnegative().max(300_000),
  rereadRatePerTask: z.number().finite().nonnegative().max(1_000),
  scrollReversalRatePerTask: z.number().finite().nonnegative().max(10_000),
  focusSwitchRatePerTask: z.number().finite().nonnegative().max(10_000),
  verificationRatePerTask: z.number().finite().nonnegative().max(10_000),
  finalVerificationRate: unitIntervalSchema,
  actionAuthority: z.literal("none"),
  screenControlAuthority: z.literal("none"),
  modelHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type AttentionVerificationModel = z.infer<typeof attentionVerificationModelSchema>;

export const attentionAdviceSchema = z.object({
  modelHash: z.string().regex(/^[a-f0-9]{64}$/),
  contextId: z.string().min(1).max(200),
  suggestedDwellMs: z.number().int().nonnegative().max(300_000),
  suggestedRereadCount: z.number().int().nonnegative().max(20),
  suggestedVerificationEvents: z.number().int().nonnegative().max(20),
  finalVerificationRequired: z.boolean(),
  mayLowerPolicyVerification: z.literal(false),
  producesScrollEvents: z.literal(false),
  changesFocus: z.literal(false),
  actionAuthority: z.literal("none"),
  screenControlAuthority: z.literal("none"),
}).strict();
export type AttentionAdvice = z.infer<typeof attentionAdviceSchema>;

export function summarizeLanguageSample(input: {
  observationId: string;
  sourceEpisodeId: string;
  observedAt: string;
  text: string;
  consented: boolean;
  identitySensitive?: boolean;
  externallyPublished?: boolean;
  protectedContent?: boolean;
}): LanguageStyleObservation {
  if (!input.consented) throw new Error("Language style observation requires explicit consent.");
  if (input.identitySensitive || input.externallyPublished || input.protectedContent) {
    throw new Error("Identity-sensitive, externally published, or protected content cannot enter the language style model.");
  }
  if (looksSensitive(input.text)) throw new Error("Language sample appears to contain secret or credential material.");
  const words = input.text.match(/[\p{L}\p{N}']+/gu) ?? [];
  if (words.length < 20) throw new Error("Language sample requires at least twenty words.");
  const sentences = input.text.split(/[.!?]+(?:\s+|$)/).map((value) => value.trim()).filter(Boolean);
  const paragraphs = input.text.split(/\n\s*\n/).map((value) => value.trim()).filter(Boolean);
  const lowerWords = words.map((word) => word.toLocaleLowerCase("en-US"));
  const contractions = words.filter((word) => /['’](?:t|s|re|ve|d|ll|m)$/i.test(word)).length;
  const firstPerson = lowerWords.filter((word) => ["i", "me", "my", "mine", "we", "us", "our", "ours"].includes(word)).length;
  const emoji = [...input.text].filter((character) => /\p{Extended_Pictographic}/u.test(character)).length;
  const uppercase = words.filter((word) => word.length > 1 && word === word.toLocaleUpperCase("en-US") && /\p{L}/u.test(word)).length;
  return languageStyleObservationSchema.parse({
    observationId: input.observationId,
    sourceEpisodeId: input.sourceEpisodeId,
    observedAt: input.observedAt,
    consented: true,
    identitySensitive: false,
    externallyPublished: false,
    protectedContent: false,
    wordCount: words.length,
    sentenceCount: Math.max(1, sentences.length),
    paragraphCount: Math.max(1, paragraphs.length),
    averageSentenceWords: words.length / Math.max(1, sentences.length),
    contractionRate: contractions / words.length,
    firstPersonRate: firstPerson / words.length,
    exclamationRate: Math.min(1, (input.text.match(/!/g) ?? []).length / Math.max(1, sentences.length)),
    questionRate: Math.min(1, (input.text.match(/\?/g) ?? []).length / Math.max(1, sentences.length)),
    emojiRate: Math.min(1, emoji / words.length),
    uppercaseWordRate: uppercase / words.length,
    vocabularyDiversity: new Set(lowerWords).size / words.length,
    sourceTextRetained: false,
  });
}

export function fitLanguageStyleModel(input: {
  ownerId: string;
  profileId: string;
  profileVersion: number;
  observations: LanguageStyleObservation[];
  trainedAt?: string;
}): LanguageStyleModel {
  const observations = validateCorpus(input.observations, languageStyleObservationSchema, "Language style");
  const sourceEpisodeIds = uniqueSources(observations);
  const weighted = (key: keyof Pick<LanguageStyleObservation, "contractionRate" | "firstPersonRate" | "exclamationRate" | "questionRate" | "emojiRate" | "uppercaseWordRate" | "vocabularyDiversity">) => {
    const totalWords = observations.reduce((sum, item) => sum + item.wordCount, 0);
    return observations.reduce((sum, item) => sum + item[key] * item.wordCount, 0) / totalWords;
  };
  const core = {
    contractVersion: 1 as const,
    modelVersion: MODEL_VERSION,
    ownerId: input.ownerId,
    profileId: input.profileId,
    profileVersion: input.profileVersion,
    trainedAt: input.trainedAt ?? new Date().toISOString(),
    sourceEpisodeIds,
    observationCount: observations.length,
    averageSentenceWords: observations.reduce((sum, item) => sum + item.averageSentenceWords, 0) / observations.length,
    averageParagraphSentences: observations.reduce((sum, item) => sum + item.sentenceCount / item.paragraphCount, 0) / observations.length,
    contractionRate: weighted("contractionRate"),
    firstPersonRate: weighted("firstPersonRate"),
    exclamationRate: weighted("exclamationRate"),
    questionRate: weighted("questionRate"),
    emojiRate: weighted("emojiRate"),
    uppercaseWordRate: weighted("uppercaseWordRate"),
    vocabularyDiversity: weighted("vocabularyDiversity"),
    rawTextRetained: false as const,
    generatesText: false as const,
    actionAuthority: "none" as const,
  };
  return languageStyleModelSchema.parse({ ...core, modelHash: sha256Canonical(core) });
}

export function adviseLanguageStyle(input: { model: LanguageStyleModel; behaviorPlan: PersonaBehaviorPlan }): LanguageStyleAdvice {
  const model = verifyModel(input.model, languageStyleModelSchema, "Language style");
  const plan = personaBehaviorPlanSchema.parse(structuredClone(input.behaviorPlan));
  const sentence = Math.max(3, Math.round(model.averageSentenceWords));
  const paragraph = Math.max(1, Math.round(model.averageParagraphSentences));
  return languageStyleAdviceSchema.parse({
    modelHash: model.modelHash,
    contextId: plan.contextId,
    targetSentenceWords: { minimum: Math.max(3, Math.round(sentence * 0.65)), maximum: Math.max(4, Math.round(sentence * 1.35)) },
    targetParagraphSentences: { minimum: Math.max(1, Math.round(paragraph * 0.5)), maximum: Math.max(1, Math.round(paragraph * 1.5)) },
    contractionPreference: model.contractionRate >= 0.05 ? "prefer" : model.contractionRate <= 0.01 ? "avoid" : "neutral",
    questionPreference: preference(model.questionRate),
    expressivePunctuationPreference: preference(Math.min(1, model.exclamationRate + model.emojiRate + model.uppercaseWordRate)),
    disclosureRequired: plan.disclosureRequired,
    generatesText: false,
    representsHumanAuthorship: false,
    actionAuthority: "none",
  });
}

export function fitAttentionVerificationModel(input: {
  ownerId: string;
  profileId: string;
  profileVersion: number;
  observations: AttentionObservation[];
  trainedAt?: string;
}): AttentionVerificationModel {
  const observations = validateCorpus(input.observations, attentionObservationSchema, "Attention");
  const sourceEpisodeIds = uniqueSources(observations);
  const totalCharacters = observations.reduce((sum, item) => sum + item.contentCharacters, 0);
  const totalDwell = observations.reduce((sum, item) => sum + item.dwellMs, 0);
  const average = (key: keyof Pick<AttentionObservation, "rereadCount" | "scrollReversalCount" | "focusSwitchCount" | "verificationEventCount">) =>
    observations.reduce((sum, item) => sum + item[key], 0) / observations.length;
  const core = {
    contractVersion: 1 as const,
    modelVersion: MODEL_VERSION,
    ownerId: input.ownerId,
    profileId: input.profileId,
    profileVersion: input.profileVersion,
    trainedAt: input.trainedAt ?? new Date().toISOString(),
    sourceEpisodeIds,
    observationCount: observations.length,
    dwellMsPer100Characters: totalCharacters === 0 ? 0 : Math.min(300_000, totalDwell / totalCharacters * 100),
    rereadRatePerTask: average("rereadCount"),
    scrollReversalRatePerTask: average("scrollReversalCount"),
    focusSwitchRatePerTask: average("focusSwitchCount"),
    verificationRatePerTask: average("verificationEventCount"),
    finalVerificationRate: observations.filter((item) => item.finalVerificationPerformed).length / observations.length,
    actionAuthority: "none" as const,
    screenControlAuthority: "none" as const,
  };
  return attentionVerificationModelSchema.parse({ ...core, modelHash: sha256Canonical(core) });
}

export function adviseAttention(input: {
  model: AttentionVerificationModel;
  behaviorPlan: PersonaBehaviorPlan;
  contentCharacters: number;
}): AttentionAdvice {
  const model = verifyModel(input.model, attentionVerificationModelSchema, "Attention");
  const plan = personaBehaviorPlanSchema.parse(structuredClone(input.behaviorPlan));
  if (!Number.isInteger(input.contentCharacters) || input.contentCharacters < 0 || input.contentCharacters > 1_000_000) {
    throw new Error("contentCharacters must be an integer from 0 through 1000000.");
  }
  const riskMultiplier = plan.effectiveRisk === "consequential" ? 2 : plan.effectiveRisk === "high" ? 1.6 : plan.effectiveRisk === "medium" ? 1.25 : 1;
  return attentionAdviceSchema.parse({
    modelHash: model.modelHash,
    contextId: plan.contextId,
    suggestedDwellMs: Math.min(300_000, Math.round(input.contentCharacters / 100 * model.dwellMsPer100Characters * riskMultiplier)),
    suggestedRereadCount: Math.min(20, Math.max(0, Math.round(model.rereadRatePerTask * riskMultiplier))),
    suggestedVerificationEvents: Math.min(20, Math.max(1, Math.round(Math.max(model.verificationRatePerTask, plan.verificationIntensity * 3) * riskMultiplier))),
    finalVerificationRequired: plan.effectiveRisk !== "low" || model.finalVerificationRate >= 0.5,
    mayLowerPolicyVerification: false,
    producesScrollEvents: false,
    changesFocus: false,
    actionAuthority: "none",
    screenControlAuthority: "none",
  });
}

function validateCorpus<T>(input: T[], schema: z.ZodType<T>, label: string): T[] {
  if (input.length < 5) throw new Error(`${label} model requires at least five observations.`);
  const parsed = input.map((item) => schema.parse(structuredClone(item)));
  const ids = parsed.map((item) => (item as { observationId: string }).observationId);
  if (new Set(ids).size !== ids.length) throw new Error(`${label} model contains duplicate observation IDs.`);
  if (uniqueSources(parsed).length < 2) throw new Error(`${label} model requires at least two source episodes.`);
  return parsed;
}

function uniqueSources<T>(items: T[]): string[] {
  return [...new Set(items.map((item) => (item as { sourceEpisodeId: string }).sourceEpisodeId))].sort();
}

function verifyModel<T extends { modelHash: string }>(input: T, schema: z.ZodType<T>, label: string): T {
  const model = schema.parse(structuredClone(input));
  const { modelHash: _modelHash, ...core } = model;
  if (sha256Canonical(core) !== model.modelHash) throw new Error(`${label} model integrity verification failed.`);
  return model;
}

function preference(rate: number): "low" | "moderate" | "high" {
  return rate >= 0.2 ? "high" : rate >= 0.05 ? "moderate" : "low";
}

function looksSensitive(text: string): boolean {
  return /(-----BEGIN [A-Z ]+PRIVATE KEY-----|\b(?:password|passwd|secret|api[_ -]?key|token)\s*[:=]\s*\S+|\bsk-[A-Za-z0-9_-]{16,})/i.test(text);
}
