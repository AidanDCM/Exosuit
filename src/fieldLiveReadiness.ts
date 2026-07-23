import {
  fieldAttestationSchema,
  fieldDisplayContractSchema,
  fieldIdentitySchema,
  fieldPolicySchema,
  verifyFieldAttestation,
  type FieldAttestation,
  type FieldPolicy,
} from "./fieldContracts.js";
import {
  FieldBootstrapEvaluator,
  fieldBootstrapManifestSchema,
  fieldBootstrapReportSchema,
  type FieldBootstrapManifest,
  type FieldBootstrapReport,
} from "./fieldBootstrap.js";
import { FieldHeartbeatMonitor, fieldHeartbeatSchema, type FieldHeartbeat } from "./fieldHeartbeat.js";

export type FieldLiveReadiness =
  | { status: "ready"; fieldId: string; fieldGeneration: number; bootId: string; completedAt: string }
  | { status: "not_ready" | "failed"; reason: string; details: unknown };

export function evaluateFieldLiveReadiness(input: {
  manifest: FieldBootstrapManifest;
  manifestDigest: string;
  bootstrapReport: FieldBootstrapReport;
  heartbeat: FieldHeartbeat;
  policy: FieldPolicy;
  attestation: FieldAttestation;
  attestationSecret: string;
  now?: Date;
}): FieldLiveReadiness {
  const now = input.now ?? new Date();
  const manifest = fieldBootstrapManifestSchema.parse(input.manifest);
  const report = fieldBootstrapReportSchema.parse(input.bootstrapReport);
  const heartbeat = fieldHeartbeatSchema.parse(input.heartbeat);
  const policy = fieldPolicySchema.parse(input.policy);
  const attestation = fieldAttestationSchema.parse(input.attestation);
  const verified = verifyFieldAttestation({
    attestation,
    policy,
    secret: input.attestationSecret,
    now,
  });
  const identity = fieldIdentitySchema.parse(verified.identity);
  fieldDisplayContractSchema.parse(verified.display);
  if (
    identity.fieldId !== manifest.identity.fieldId ||
    identity.fieldGeneration !== manifest.identity.fieldGeneration ||
    identity.agentId !== manifest.identity.agentId ||
    identity.windowsSessionId !== manifest.identity.windowsSessionId
  ) {
    return { status: "failed", reason: "attested_identity_mismatch", details: {} };
  }
  if (attestation.policyHash !== manifest.policyHash) {
    return { status: "failed", reason: "policy_binding_mismatch", details: {} };
  }
  const monitor = new FieldHeartbeatMonitor({
    field: { fieldId: identity.fieldId, fieldGeneration: identity.fieldGeneration },
    agentId: identity.agentId,
    // Hyper-V KVP reads are synchronous and live evidence shows roughly
    // ten seconds of collection latency. Keep this allowance local to the
    // readiness join; ordinary heartbeat monitors retain their 5s/15s defaults.
    degradedAfterMs: 15_000,
    faultAfterMs: 30_000,
  });
  monitor.accept(heartbeat, now);
  const health = monitor.assess(now);
  if (health.state !== "healthy" || !heartbeat.desktopReady || heartbeat.sessionLocked || heartbeat.secureDesktopActive) {
    return { status: "not_ready", reason: "heartbeat_or_desktop_not_ready", details: health };
  }
  const runtimeObservedAt = heartbeat.observedAt;
  const combinedReport = fieldBootstrapReportSchema.parse({
    ...report,
    reportedAt: runtimeObservedAt,
    checks: [
      ...report.checks,
      {
        name: "secure_desktop_inactive",
        passed: !heartbeat.secureDesktopActive,
        observedAt: runtimeObservedAt,
        summary: "Authenticated heartbeat reported the secure desktop inactive.",
        evidence: {},
      },
      {
        name: "heartbeat_started",
        passed: true,
        observedAt: runtimeObservedAt,
        summary: "Authenticated heartbeat was accepted for the expected guest.",
        evidence: { bootId: heartbeat.bootId, sequence: heartbeat.sequence },
      },
    ],
  });
  const bootstrap = new FieldBootstrapEvaluator({ manifest, manifestDigest: input.manifestDigest })
    .evaluate(combinedReport, now);
  if (bootstrap.status !== "ready") {
    return { status: bootstrap.status, reason: "bootstrap_not_ready", details: bootstrap };
  }
  return {
    status: "ready",
    fieldId: identity.fieldId,
    fieldGeneration: identity.fieldGeneration,
    bootId: heartbeat.bootId,
    completedAt: runtimeObservedAt,
  };
}
