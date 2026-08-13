import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  AssistedEnvelopeReplayGuard,
  createAssistedExecutionEnvelope,
  createAssistedProposal,
  reviewAssistedProposal,
} from "../src/assistedMode.js";
import { CredentialAuthorizationBroker, verifyCredentialDecision } from "../src/credentialBroker.js";
import { createShadowPrediction } from "../src/shadowLearning.js";
import {
  issueShadowCapability,
  ShadowPredictionOnlyGateway,
  verifyShadowReceipt,
} from "../src/shadowIsolation.js";

const field = { fieldId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", fieldGeneration: 7 };
const sceneHash = "a".repeat(64);
const policyHash = "b".repeat(64);
const personaHash = "c".repeat(64);
const processIdentity = { processName: "browser.exe", executableSha256: "d".repeat(64) };

describe("Shadow prediction-only boundary", () => {
  it("issues a capability with every execution and secret authority disabled", () => {
    const capability = issueShadowCapability({
      field,
      processInstanceId: "11111111-1111-4111-8111-111111111111",
      modelVersion: "shadow-v1",
      issuedAt: "2026-08-04T04:00:00.000Z",
      sessionId: "22222222-2222-4222-8222-222222222222",
    });
    expect(capability).toMatchObject({
      mayPredict: true,
      mayUseNetwork: false,
      mayReadCredentials: false,
      mayAuthorize: false,
      mayInvokeCommands: false,
      mayInjectInput: false,
      mayAdministerField: false,
      actionAuthority: "none",
    });
  });

  it("returns integrity-bound receipts and never forwards predictions to execution", async () => {
    const capability = issueShadowCapability({
      field,
      processInstanceId: "11111111-1111-4111-8111-111111111111",
      modelVersion: "shadow-v1",
      issuedAt: "2026-08-04T04:00:00.000Z",
      sessionId: "22222222-2222-4222-8222-222222222222",
    });
    const gateway = new ShadowPredictionOnlyGateway(capability, {
      predict: (request) => createShadowPrediction({
        field: request.field,
        observationId: request.observationId,
        predictedAt: "2026-08-04T04:00:01.000Z",
        action: {
          intent: "Select the next local fixture control",
          targetKey: "fixture:next",
          method: "semantic",
          delayMs: 500,
          expectedResult: "The fixture advances one synthetic step.",
        },
        confidence: 0.8,
        sourceEpisodeIds: [],
        modelVersion: "shadow-v1",
      }),
    });
    const request = {
      requestId: "33333333-3333-4333-8333-333333333333",
      sessionId: capability.sessionId,
      field,
      observationId: "obs-1",
      sceneVersion: 4,
      sceneHash,
      requestedAt: "2026-08-04T04:00:02.000Z",
      features: ["fixture:next"],
      layoutFingerprint: "e".repeat(64),
    };
    const receipt = await gateway.predict(request, "2026-08-04T04:00:03.000Z");
    expect(verifyShadowReceipt(receipt)).toBe(true);
    expect(receipt.executionForwarded).toBe(false);
    expect(receipt.inputInjected).toBe(false);
    expect(receipt.prediction.executionAllowed).toBe(false);
    await expect(gateway.predict(request, "2026-08-04T04:00:04.000Z")).rejects.toThrow(/only once/i);
  });

  it("rejects cross-field, stale, wrong-model, and tampered capabilities", async () => {
    const capability = issueShadowCapability({
      field,
      processInstanceId: "11111111-1111-4111-8111-111111111111",
      modelVersion: "shadow-v1",
      issuedAt: "2026-08-04T04:00:00.000Z",
      ttlMs: 1_000,
    });
    expect(() => new ShadowPredictionOnlyGateway({ ...capability, mayInjectInput: true as never }, { predict: () => { throw new Error("not used"); } }))
      .toThrow();
    const gateway = new ShadowPredictionOnlyGateway(capability, {
      predict: (request) => createShadowPrediction({
        field: request.field,
        observationId: request.observationId,
        predictedAt: request.requestedAt,
        action: { intent: "wait", targetKey: "system", method: "wait", delayMs: 100, expectedResult: "ready" },
        confidence: 0.5,
        sourceEpisodeIds: [],
        modelVersion: "wrong-model",
      }),
    });
    await expect(gateway.predict({
      requestId: randomUUID(), sessionId: capability.sessionId, field, observationId: "obs", sceneVersion: 1, sceneHash,
      requestedAt: "2026-08-04T04:00:00.500Z", features: ["system:wait"], layoutFingerprint: "f".repeat(64),
    }, "2026-08-04T04:00:00.600Z")).rejects.toThrow(/model version/i);
  });
});

describe("Assisted proposal boundary", () => {
  function proposal() {
    return createAssistedProposal({
      field,
      sceneVersion: 9,
      sceneHash,
      policyHash,
      personaProfileHash: personaHash,
      declaredRisk: "low",
      createdAt: "2026-08-04T05:00:00.000Z",
      proposalId: "44444444-4444-4444-8444-444444444444",
      steps: [
        { ordinal: 0, intent: "Enter a local draft", targetKey: "fixture:draft", method: "keyboard", expectedResult: "Draft text is visible.", verificationRequired: true, finalSubmission: false, externalCommitment: false },
        { ordinal: 1, intent: "Review the local draft", targetKey: "fixture:review", method: "semantic", expectedResult: "Review state is visible.", verificationRequired: true, finalSubmission: true, externalCommitment: true },
      ],
    });
  }

  it("creates non-executable proposals, owner reviews, and downstream-only envelopes", () => {
    const value = proposal();
    expect(value.executionAllowed).toBe(false);
    expect(value.downstreamReauthorizationRequired).toBe(true);
    const review = reviewAssistedProposal({
      proposal: value,
      ownerId: "owner-a",
      decision: "approve_for_downstream_review",
      approvedStepOrdinals: [0, 1],
      reason: "Owner reviewed the synthetic proposal.",
      reviewedAt: "2026-08-04T05:01:00.000Z",
      localTransport: true,
      interactiveOwnerPresent: true,
      reviewId: "55555555-5555-4555-8555-555555555555",
    });
    const envelope = createAssistedExecutionEnvelope({
      proposal: value,
      review,
      issuedAt: "2026-08-04T05:01:01.000Z",
      envelopeId: "66666666-6666-4666-8666-666666666666",
    });
    expect(envelope.executionAllowed).toBe(false);
    expect(envelope.downstreamMustReobserve).toBe(true);
    expect(envelope.downstreamMustReauthorizeEachStep).toBe(true);
    expect(envelope.finalSubmissionRequiresInteractiveOwner).toBe(true);
  });

  it("fails closed for consequential proposals, unattended review, stale scene, changed policy, and replay", () => {
    expect(() => createAssistedProposal({
      field, sceneVersion: 1, sceneHash, policyHash, personaProfileHash: personaHash, declaredRisk: "consequential",
      steps: [{ ordinal: 0, intent: "pay", targetKey: "payment", method: "semantic", expectedResult: "paid", verificationRequired: true, finalSubmission: true, externalCommitment: true }],
    })).toThrow(/consequential/i);
    const value = proposal();
    expect(() => reviewAssistedProposal({
      proposal: value, ownerId: "owner-a", decision: "approve_for_downstream_review", reason: "test",
      reviewedAt: "2026-08-04T05:01:00.000Z", localTransport: true, interactiveOwnerPresent: false,
    })).toThrow(/interactive local owner/i);
    const review = reviewAssistedProposal({
      proposal: value, ownerId: "owner-a", decision: "approve_for_downstream_review", reason: "test",
      reviewedAt: "2026-08-04T05:01:00.000Z", localTransport: true, interactiveOwnerPresent: true,
    });
    const envelope = createAssistedExecutionEnvelope({ proposal: value, review, issuedAt: "2026-08-04T05:01:01.000Z" });
    const guard = new AssistedEnvelopeReplayGuard();
    expect(() => guard.consume(envelope, { field, sceneVersion: 10, sceneHash, policyHash, now: "2026-08-04T05:01:02.000Z" })).toThrow(/scene is stale/i);
    expect(() => guard.consume(envelope, { field, sceneVersion: 9, sceneHash, policyHash: "f".repeat(64), now: "2026-08-04T05:01:02.000Z" })).toThrow(/policy changed/i);
    expect(guard.consume(envelope, { field, sceneVersion: 9, sceneHash, policyHash, now: "2026-08-04T05:01:02.000Z" })).toEqual(envelope);
    expect(() => guard.consume(envelope, { field, sceneVersion: 9, sceneHash, policyHash, now: "2026-08-04T05:01:03.000Z" })).toThrow(/already consumed/i);
  });
});

describe("credential authorization broker", () => {
  function grant(broker: CredentialAuthorizationBroker) {
    return broker.issue({
      requestId: randomUUID(),
      actor: "owner_local",
      ownerId: "owner-a",
      field,
      process: processIdentity,
      origin: "https://example.com",
      purpose: "sign_in",
      localTransport: true,
      interactiveOwnerPresent: true,
      requestedAt: "2026-08-04T06:00:00.000Z",
      ttlMs: 60_000,
      reason: "Owner approved one local sign-in attempt.",
    });
  }

  it("issues opaque single-use handles without secret material", () => {
    const broker = new CredentialAuthorizationBroker();
    const handle = grant(broker);
    expect(handle.opaqueHandle).toMatch(/^cred_/);
    expect(handle).toMatchObject({ maximumUses: 1, secretMaterialIncluded: false, modelVisible: false, actionAuthority: "none" });
    expect(JSON.stringify(handle)).not.toContain("password");
  });

  it("authorizes only an exact fresh protected-field scope and consumes it once", () => {
    const broker = new CredentialAuthorizationBroker();
    const handle = grant(broker);
    const base = {
      opaqueHandle: handle.opaqueHandle,
      field,
      process: processIdentity,
      origin: "https://example.com",
      purpose: "sign_in" as const,
      observedAt: "2026-08-04T06:00:10.000Z",
      sceneVersion: 5,
      sceneHash,
      protectedFieldFocused: true,
      humanVerificationRequired: false,
    };
    const allowed = broker.redeem({ ...base, redemptionId: randomUUID() });
    expect(allowed.status).toBe("allow_trusted_adapter");
    expect(verifyCredentialDecision(allowed)).toBe(true);
    expect(allowed.secretMaterialIncluded).toBe(false);
    expect(broker.redeem({ ...base, redemptionId: randomUUID() }).status).toBe("block");
  });

  it("blocks models, remote grants, wrong origin/process/Field, missing focus, and protected interactive state", () => {
    const broker = new CredentialAuthorizationBroker();
    expect(() => broker.issue({
      requestId: randomUUID(), actor: "pilot_model", ownerId: "owner-a", field, process: processIdentity,
      origin: "https://example.com", purpose: "sign_in", localTransport: true, interactiveOwnerPresent: true,
      requestedAt: "2026-08-04T06:00:00.000Z", ttlMs: 60_000, reason: "test",
    })).toThrow(/only the interactive local owner/i);
    const handle = grant(broker);
    const base = {
      opaqueHandle: handle.opaqueHandle,
      field,
      process: processIdentity,
      origin: "https://example.com",
      purpose: "sign_in" as const,
      observedAt: "2026-08-04T06:00:10.000Z",
      sceneVersion: 5,
      sceneHash,
      protectedFieldFocused: true,
      humanVerificationRequired: false,
    };
    expect(broker.redeem({ ...base, redemptionId: randomUUID(), origin: "https://other.example.com" }).status).toBe("block");
    expect(broker.redeem({ ...base, redemptionId: randomUUID(), process: { ...processIdentity, executableSha256: "e".repeat(64) } }).status).toBe("block");
    expect(broker.redeem({ ...base, redemptionId: randomUUID(), field: { ...field, fieldGeneration: 8 } }).status).toBe("block");
    expect(broker.redeem({ ...base, redemptionId: randomUUID(), protectedFieldFocused: false }).status).toBe("block");
    expect(broker.redeem({ ...base, redemptionId: randomUUID(), humanVerificationRequired: true }).status).toBe("block");
  });
});
