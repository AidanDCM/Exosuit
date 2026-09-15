# Forensic Atomic Audit Addendum — Field Foundation Expansion

**Audit level:** 4 — Forensic Atomic Audit  
**Date:** 2026-07-21  
**Branch:** `agent/field-foundation`  
**Parent audit:** `ATOMIC_AUDIT_2026-07-21_GLOVE_FIELD_FOUNDATION.md`

## 1. Scope

This addendum audits the expansion after the first Field boundary slice:

- fake-first Field Manager,
- exact provisioned-policy binding,
- shared TypeScript/.NET Field fixture,
- encrypted demonstration store,
- Field scene graph,
- Shadow prediction/evaluation contracts,
- typed VM provisioning plan,
- Windows Field path scope adapted from Parts & Pieces,
- bounded artifact transfer broker,
- CI evidence from the draft PR.

It does not audit live Hyper-V, Windows recording, predictive models, learned motor execution, or ChatGPT operation because those do not exist.

## 2. Evidence Register

| Evidence | Supports | Limitation |
|---|---|---|
| `src/fieldManager.ts` | typed fake lifecycle, policy binding, audit | no real provisioner or persistence |
| `tests/fieldManager.test.ts` | intended lifecycle/policy/fault behavior | tests not executed on available hosted runner |
| shared JSON fixture and TS/.NET tests | intended wire vocabulary agreement | executable confirmation pending |
| `src/encryptedDemonstrationStore.ts` | encrypted terminal episode storage | no live recorder or key operations |
| `src/fieldScene.ts` | pure scene identity/readiness/event rules | no Windows producer |
| `src/shadowLearning.ts` | prediction-only records and metrics | no model predicts anything |
| `src/fieldProvisioningPlan.ts` | deterministic VM configuration intent | no Hyper-V commands/API calls |
| Parts donor `parts/python/path_scope/path_scope.py` | original scope-guard pattern | donor tests are not Exosuit evidence |
| `src/fieldPathScope.ts` | Windows-specific adapted guard | real reparse inspection delegated to live broker |
| `src/fieldArtifactBroker.ts` | in-memory transfer manifest/state/hash policy | no live byte transport or filesystem copy |
| GitHub runs `29854178787`, `29854178777` | hosted runner/account state | zero steps; no code judgment |

## 3. Hosted Validation Finding

The draft PR triggered Exosuit CI and Security Audit. All jobs failed before checkout with zero steps. The job-step API returned an empty list, and job logs were unavailable.

Classification:

- **not a code failure,** because no command ran;
- **not a pass,** because no command ran;
- **platform/runner validation blocked.**

No audit or PR language may call the branch GitHub validated.

## 4. Atomic Unit — Fake Field Manager

**Purpose:** Provide one typed lifecycle before a Hyper-V provider exists.  
**Inputs:** planned identity, Glove binding, policy, attestation, actor, provider.  
**Outputs:** lifecycle records and hash-linked audit events.  
**State:** in-memory registry, provisioned-policy hashes, audit list.  
**Authority:** host-side Field Manager; not pilot.  
**Failure modes:** provider exception, policy substitution, stale identity, unsupported lifecycle, lost in-memory state.  
**Severity:** Critical when connected to live provisioning.  
**Protections:** exact policy hash recorded after provision; mode entry must match; expiry checked; failure enters `faulted`; typed provider interface.  
**Missing:** persistence, locks, cancellation, deadlines, replay/nonce state, real provider.  
**Confidence:** Medium as pure design; Low operationally.

### Question Everything result

- Can the model insert a command? No command field exists.
- Can mode use a different policy? Rejected by stored hash.
- Can provision failure still appear ready? No; transitions to faulted.
- Can fault vanish directly? No; lifecycle rules prevent ready transition.
- Can manager recover after restart? Not yet; this is a blocking gap.

## 5. Atomic Unit — Encrypted Demonstration Store

**Purpose:** Persist terminal demonstration metadata confidentially and detect tampering.  
**Inputs:** completed/aborted episode and 32-byte key.  
**Outputs:** AES-256-GCM envelope.  
**State:** atomic files named by hashed episode ID.  
**Failure modes:** wrong key, corrupted ciphertext, oversized episode, raw visual bytes embedded, stale index after deletion, key loss.  
**Severity:** Critical privacy.  
**Protections:** terminal-only, redaction pass, inline visual-byte denial, authenticated Field and episode hashes, atomic write, size limits, invalid-file hiding, per-Field deletion.  
**Missing:** key rotation, deletion certificate, retention scheduler, visual-byte store, backup/recovery, secure key storage, content-based secret scanning.  
**Confidence:** Medium as file component; Low for complete privacy.

### Important limitation

Redaction based on key names does not find every secret embedded in ordinary text. Live recording must integrate Windows sensitive-field identity and content classification before persistence.

## 6. Atomic Unit — Field Scene Graph

**Purpose:** Maintain continuous guest state without treating each screenshot as an unrelated world.  
**Inputs:** Field-bound snapshots.  
**Outputs:** current scene and incremental events.  
**Failure modes:** stale version, incorrect active focus, orphan element, cursor outside display, secure/locked session marked ready, busy queue ignored.  
**Severity:** High.  
**Protections:** generation binding, monotonic versions/time, unique identity, focus consistency, modal ownership, geometry checks, input-readiness gate.  
**Missing:** window generation rather than raw current IDs, process/title continuity integration, Windows source, visual-region provenance, event hash/audit.  
**Confidence:** Medium.

## 7. Atomic Unit — Shadow Learning Foundation

**Purpose:** Measure similarity without authorizing any action.  
**Inputs:** prediction and actual owner action from one observation/Field generation.  
**Outputs:** comparison and aggregate metrics.  
**Failure modes:** prediction used as action, comparison across contexts, trajectory time disorder, misleading aggregate accuracy.  
**Severity:** High because Shadow must remain non-mutating.  
**Protections:** literal `executionAllowed: false`, same observation/generation requirement, duplicate prediction denial, separate metric dimensions.  
**Missing:** no-input call-graph proof, prediction timeout behavior, confidence calibration, model/retrieval source, correction workflow, statistical thresholds.  
**Confidence:** Medium for contracts; no model evidence.

## 8. Atomic Unit — VM Provisioning Plan

**Purpose:** Define what Hyper-V must do without exposing arbitrary commands.  
**Inputs:** Field identity, display, image/storage identities, bounded resources, network mode.  
**Outputs:** strict integrity-hashed plan and required steps.  
**Failure modes:** plan tampering, mismatched disks/images, unsafe integrations, resource exhaustion, plan/provider drift.  
**Severity:** Critical when executed.  
**Protections:** strict schema, fixed Hyper-V Gen 2, secure boot, no nested virtualization, literal false clipboard/drive/input bridge, host LAN/inbound false, exact image/task identities, unique mandatory steps, plan hash.  
**Missing:** supported API mapping, capability discovery, path/image registry, provider result reconciliation, resource reservations, rollback.  
**Confidence:** Medium as desired-state contract.

## 9. Atomic Unit — Field Path Scope

**Donor:** Parts & Pieces `path_scope`.  
**Adaptation:** TypeScript Windows-specific artifact boundary.  
**Purpose:** Ensure caller-relative paths stay inside one approved Field folder.  
**Additional Exosuit protections:** transfer direction, UNC/drive rejection, ADS colon rejection, reserved devices, invalid characters, trailing dot/space, ambiguous segments, explicit reparse inspection requirement.  
**Failure modes:** reparse race, case/normalization behavior, hard links, filesystem-specific aliases, missing ancestor inspection.  
**Severity:** Critical for live transfer.  
**Confidence:** Medium pure; Low live until Windows filesystem tests.

## 10. Atomic Unit — Artifact Broker

**Purpose:** Describe and verify bounded Field transfers before live transport.  
**Inputs:** direction, scoped path, classification, media type, exact byte length and SHA-256.  
**Outputs:** prepared/verified/completed/cancelled/failed state.  
**Protections:** direction-specific roots, ordinary sensitive/untrusted export denial, constant-time digest comparison, immutable returned copies, no completion before verification.  
**Missing:** actual byte copy, independent malware/content scanning, owner-reviewed sensitive export path, durable audit, idempotency, partial transfer recovery.  
**Confidence:** Medium pure; no transport evidence.

## 11. Assumption Ledger Additions

| Assumption | Risk | Required verification |
|---|---|---|
| AES-GCM episode files remain manageable under configured size | memory spikes on large JSON | performance and streaming design |
| Node `win32` normalization matches live Windows path behavior | platform edge mismatch | Windows path corpus |
| `lstat`/future inspector can identify all relevant reparse behavior | bypass through uncommon reparse/hardlink semantics | dedicated Windows security test |
| one policy per provisioned Field mode is acceptable | policy change may require reprovision | owner UX and lifecycle decision |
| normalized trajectory distance is useful | metric may not reflect perceived similarity | blinded owner studies |
| exact expected hash is known before transfer | some generated outputs only known afterward | add staged output-manifest flow |

## 12. Missing Tests and Proof

- executable TypeScript and .NET results,
- cross-platform path tests on actual Windows,
- encrypted-store large/corrupt/truncated file matrix,
- Field Manager durable hydration and concurrent calls,
- provisioning-plan/provider conformance tests,
- artifact broker reparse race tests,
- no-input instrumentation for Shadow,
- complete CI logs from a functioning runner.

## 13. Security and Privacy Verdict

The expansion improves architecture by putting sensitive capabilities behind explicit contracts before live implementation. It does not make live recording or VM operation safe yet.

Highest remaining risks:

1. live input/visual recording privacy,
2. host/guest identity and key storage,
3. filesystem reparse/race behavior,
4. model/policy separation in Pilot,
5. uncertain external effects,
6. operational deletion and key rotation,
7. overclaiming similarity as human authorship.

## 14. Rollback

All expanded components remain disconnected from current Glove runtime. They can be disabled by omitting imports/runtime construction or reverted independently. No Hyper-V, input hook, visual capture, or MCP Field route was added.

## 15. Verdict

**REVIEW — broader and materially stronger Field foundation; executable validation still blocked.**

The code now defines a coherent fake lifecycle, encrypted teaching metadata, continuous scene state, non-executing Shadow evaluation, safe desired VM configuration, Windows path confinement, and bounded transfer policy. None of these may be promoted to live capability until exact commands run and later Windows/Hyper-V/privacy gates pass.
