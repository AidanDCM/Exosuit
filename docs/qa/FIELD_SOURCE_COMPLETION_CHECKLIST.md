# Field Source Completion Checklist

## Repository and governance

- [x] Glove/Field boundary documented
- [x] mandatory developer reading updated
- [x] implementation status separated from roadmap
- [x] owner/developer/test/runbook manuals
- [x] Parts & Pieces traceability
- [x] threat model
- [x] failure-injection matrix
- [x] Level 4 source-exhaustion audit
- [x] engineering log
- [x] CI contract and evidence artifacts
- [x] issue template and ordered live backlog

## Environment and lifecycle

- [x] Field identity/generation
- [x] policy and attestation
- [x] lifecycle registry
- [x] fake Field Manager
- [x] immutable base + disposable OS overlay + task/personal disks
- [x] strict provisioning plan
- [x] read-only host capability check
- [x] non-mutating plan resolver
- [x] guarded apply and bounded rollback
- [x] exact-generation destroy script
- [x] guest bootstrap precheck
- [x] one-command validation/evidence runner
- [ ] scripts parsed/executed on Windows
- [ ] actual Hyper-V provider/acceptance

## Communication and health

- [x] signed direction/generation/sequence/nonce/key/time/payload envelope
- [x] replay guard
- [x] TypeScript/.NET shared signed fixture
- [x] heartbeat/boot identity/liveness
- [x] bootstrap report evaluator
- [x] typed guest command authorization
- [ ] durable replay state
- [ ] key protection/rotation
- [ ] live transport and guest emitter
- [ ] guest command enforcement integration

## Teach, visual, and learning

- [x] consent-bound recorder state machine
- [x] no-input literal and tests
- [x] episode integrity and redaction
- [x] encrypted demonstration store
- [x] visual consent/region/budget/TTL policy
- [x] scene graph
- [x] Shadow no-execution contracts and metrics
- [ ] live input/UIA/system hooks
- [ ] visible recorder UI and independent stop
- [ ] visual sensor/blob store
- [ ] retrieval/segmentation/predictor
- [ ] personal behavior models

## Files, recovery, and diagnostics

- [x] Windows path scope
- [x] reparse-inspection requirement
- [x] artifact manifest/hash/size/classification lifecycle
- [x] deterministic no-blind-retry recovery
- [x] local owner/service/model administration separation
- [x] privacy-safe support bundle
- [x] full fake Field pulse
- [ ] live cross-VM transfer and TOCTOU control
- [ ] live recovery coordinator
- [ ] physical emergency-stop evidence

## Validation boundary

- [x] focused test command
- [x] full fake pulse command
- [x] Field invariant validator
- [x] PowerShell static tests
- [x] .NET channel tests
- [x] CI PowerShell parsing
- [x] evidence-preserving local runner
- [ ] current-head commands executed successfully
- [ ] Windows/Hyper-V live evidence
- [ ] owner acceptance

## Source-only verdict

All useful source-only boxes are complete or represented by a concrete, testable contract, guarded script, manual, audit, and live acceptance task. Remaining unchecked boxes require executable Windows/Hyper-V work or real runtime integration and must not be claimed complete.
