# Field gate acceptance criteria

**Status:** PROPOSED. Not ratified by the owner.
**Applies to:** `field_hyperv_lifecycle`, `field_authenticated_channel`, `field_guest_readiness`
**Written:** 2026-07-27

## Why this document exists

`scripts/validate-production-readiness.mjs` treats a gate as passing when its
manifest entry says `pass` and carries evidence references. Nothing anywhere
defined what `pass` should mean for these three gates, so the only thing
standing between "a run succeeded once" and "production ready" was judgment,
with no written standard to judge against.

These criteria are derived from invariants the code already enforces, so they
are checkable rather than aspirational. They are a proposal. The owner sets the
bar; an agent proposing its own passing conditions and then certifying against
them is not a control.

## Rules that apply to all three gates

**R1 — Production configuration.** Evidence must come from a generation with
`developmentAccess` absent from the plan, and `developmentAccessEnabled` and
`developmentUnattendedSetupEnabled` both false in the manifest. Evidence
gathered with the disposable `ExosuitDev` auto-logon account is non-production
by contract and cannot support any gate.

**R2 — Exact provenance.** Every run must record the base image id and SHA-256,
the plan hash, and the repository commit. The base image digest reported *by the
guest* must equal the digest of the promoted image on the host. The commit must
equal `candidateCommit`.

**R3 — Repeatability.** At least three consecutive successful runs on the same
commit and base image, each from a freshly provisioned generation. One success
is an existence proof, not a gate.

**R4 — Negative coverage.** Each gate lists required failure cases below. A gate
that has only ever been observed succeeding does not demonstrate that its
controls work; it demonstrates that they were not exercised.

**R5 — Evidence is machine-checkable.** Every claim traces to a committed
artifact under `artifacts/`. Prose summaries are not evidence.

**R6 — No unexplained anomalies.** Any inconsistency observed during a run is
either explained in the evidence or blocks the gate. See the `not_ready` note
under `field_guest_readiness` for an example of an anomaly that turned out to be
correct behaviour, and had to be understood before it could be dismissed.

---

## `field_hyperv_lifecycle`

Demonstrates that a Field generation can be created, run, and destroyed under
the reviewed contract, leaving nothing behind.

### Required evidence

1. **Base image provenance.** A `base-build-result.json` with `success: true`,
   a receipt whose `sourceCommit` matches `candidateCommit`, `systemIdentity`,
   `networkDetached` and `nonBuiltInLocalAccountsAbsent` all true, and a target
   recorded as `readOnly: true` whose SHA-256 is re-verified independently of
   the builder's own record.
2. **Injected script provenance.** `injectedScriptDigests` present, and every
   digest equal to the digest of the corresponding file in the repository at
   `candidateCommit`. This exists because a repository fix does not reach a
   guest until a new base image is sealed, and two generations were once
   provisioned against an image that predated the fix.
3. **Provisioning.** `provision-attempt.json` with `success: true` and
   `completedSteps` containing every step in the plan's `steps` array, in order.
4. **Plan conformance.** The plan used must satisfy the provisioning script's
   own assertions: Generation 2, Secure Boot on, nested virtualization off,
   base image read-only, runtime overlay disposable **and** differencing with
   `parentImageId` equal to the base image, task disk disposable,
   `hostLanAccess` and `inboundConnections` false, and `artifactBrokerOnly` true
   with clipboard, broad drive mapping and host input injection all false.
5. **Isolation observed, not just planned.** The created VM must be shown to
   have the isolated switch attached and no route to the host LAN.
6. **Destruction.** A removal record showing the VM deregistered and the
   generation root removed, plus a post-removal check that no VM references the
   overlay or task disk and that neither file remains.
7. **Base image untouched.** The source image's SHA-256 must be unchanged after
   the full lifecycle, proving the differencing overlay never wrote to its
   parent.

### Required negative cases

- Provisioning refuses a plan whose `planHash` does not match its contents.
- Provisioning refuses a base image whose on-disk digest differs from the host
  configuration entry.
- Provisioning refuses a plan requesting `hostLanAccess`, `clipboard`,
  `hostInputInjection`, or a non-differencing runtime overlay.
- Provisioning refuses to apply without the exact typed confirmation.
- Removal refuses a mismatched typed confirmation.

---

## `field_authenticated_channel`

Demonstrates that host and guest exchange only authenticated, fresh,
non-replayable messages over VMBus, with no network path.

### Required evidence

1. **Three message types verified** in one generation: `handshake`,
   `bootstrap_status`, and `heartbeat`, each with `status: "verified"`.
2. **Transport.** `transport: "hyperv_kvp"` on a VM with no network adapter or
   an isolated switch only. The channel must be shown to work with zero network
   connectivity.
3. **Generation binding.** Every envelope's `fieldId` and `fieldGeneration`
   match the plan, and the key id matches the manifest's `channelKeyId`.
4. **Freshness.** Every accepted envelope has `sentAt <= now < expiresAt`, with
   a TTL inside the contract's 1–300 second range.
5. **Ordering.** `sequence` strictly increases across the run, and
   `replayLastSequence` tracks it.
6. **Payload integrity.** `payloadHash` verified against the payload for every
   accepted message.

### Required negative cases

Each must be *rejected*, with the rejection recorded as evidence:

- A replayed `messageId`.
- A replayed nonce.
- A sequence equal to or lower than the last accepted one.
- An expired envelope, and one whose `sentAt` is in the future.
- A tampered payload, so `payloadHash` no longer matches.
- A valid envelope from a different `fieldGeneration`.
- An envelope in the wrong direction.
- A forged or truncated signature.
- A secret shorter than 32 characters must be refused at construction.

These correspond one-to-one with the guards in `src/fieldChannel.ts`. A gate
that never exercises them proves only that the happy path works.

---

## `field_guest_readiness`

Demonstrates that a freshly provisioned guest reaches a verified ready state
under its own attestation.

### Required evidence

1. **All twelve bootstrap checks reported and passed**, from
   `fieldBootstrapCheckNameSchema`: `identity`, `base_image`, `personal_state`,
   `task_disk`, `directory_layout`, `display_contract`, `agent_binary`,
   `channel_key`, `policy_binding`, `session_unlocked`,
   `secure_desktop_inactive`, `heartbeat_started`.
2. **Evaluator verdict `ready`.** `FieldBootstrapEvaluator.evaluate` must return
   `status: "ready"`, not `not_ready` and not `failed`.
3. **Agent binary digest** reported by the guest equals the digest recorded in
   the base image build receipt.
4. **Display contract** actual dimensions equal planned dimensions.
5. **Heartbeat liveness.** At least three heartbeats with strictly increasing
   sequence, a stable `bootId`, `lifecycle: "ready"`, `desktopReady: true`,
   `sessionLocked: false`, `secureDesktopActive: false`, and no interval
   exceeding the configured degraded threshold.
6. **Timing bound.** Ready reached within a stated budget from `start_vm`,
   recorded so regressions are visible. Observed once at ~5 minutes 30 seconds.

### Known gap that must be closed first

The guest's PowerShell precheck deliberately omits `secure_desktop_inactive` and
`heartbeat_started`, because they are runtime properties only the authenticated
agent can attest. See `scripts/windows/Initialize-ExosuitFieldGuest.ps1`. The
evaluator therefore correctly returns `not_ready` rather than `failed`, and
**no second bootstrap report is ever emitted incorporating the agent's runtime
checks**, so `bootstrap_status` stays `not_ready` for the life of a generation.

Readiness is currently judged across all three channel messages, which is why
the run still reported ready. But this gate cannot pass on
`FieldBootstrapEvaluator` returning `ready` until the agent emits a completing
report. Closing that gap is a prerequisite, not a detail.

### Required negative cases

- A report missing any mandatory check yields `not_ready`, never `ready`.
- A report with any failing check yields `failed`.
- A report whose `manifestDigest` does not match is rejected.
- A report crossing Field generations is rejected.
- A report predating its manifest, or with a check timestamp outside the
  reporting interval, is rejected.
- An expired manifest is rejected.
- A heartbeat claiming `desktopReady` while the session is locked or the secure
  desktop is active is rejected.
- A heartbeat whose `bootId` changes within one generation is rejected.

---

## Current standing against these criteria

As of `85fd712`, evidence exists but no gate passes:

| Criterion | Status |
|---|---|
| R1 production configuration | **Fails.** All live evidence used development access |
| R2 exact provenance | Met |
| R3 repeatability | **Fails.** One run per gate |
| R4 negative coverage | **Fails.** No negative cases executed live |
| R5 machine-checkable evidence | Met |
| R6 no unexplained anomalies | Met, after the `not_ready` behaviour was explained |

The shortest honest path to a first genuine pass is `field_hyperv_lifecycle`:
it needs a production-configured plan, three consecutive runs, and the five
negative cases, none of which require the runtime stack to be complete.
