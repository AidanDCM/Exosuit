# CHN-001 live acquisition and promotion

## Change report

- **Goal:** execute the complete CHN-001 live matrix, bind it to signed Field
  lifecycle evidence, obtain independent technical review, record the exact artifact,
  and promote only the reviewed candidate.
- **Master-plan phase and gate:** M1, CHN-001.
- **Subsystem ownership:** Field owns the isolated VM, guest runtime, authenticated
  channel, storage lifecycle, and exact-VM host stop. Glove authority was not expanded.
- **Files changed:** append-only completion lifecycle, evidence, custody, TPM-proof,
  and transition ledgers; one content-addressed CHN artifact; the CHN evidence review
  note; this engineering log.
- **Identity/generation and policy impact:** evidence binds Field
  `4401b702-334f-475e-b867-b7d06798443d` generation 3, VM
  `b538709f-9eda-4696-a40b-ffc14de3dd58`, and source commit
  `48b50719559a4849be2c8613153b0ee81cc92470`. Production deny defaults remained
  literal: isolated network, no host LAN/inbound connection, no host input injection,
  and no development access. The pilot cannot create or expand policy.
- **Parts & Pieces and donor patterns considered:** no donor code was added. Existing
  exact-path destruction, authenticated KVP, durable replay, completion-ledger, and
  owner-service patterns were used without changing their authority boundaries.
- **Questions and assumptions:** the display rollback required setting the VM adapter
  to the signed 1920x1080 contract after restoring 1280x720 left the guest runtime
  fail-closed. The degraded stop receipt uses a conservative Windows-event upper bound
  because receipt serialization failed after the stop. Independent review explicitly
  accepted that reconciliation.
- **Tests added or updated:** no source test changed during the exact-commit run.
  Existing CHN, completion, artifact-reconciliation, repository, plan, Field-contract,
  compiler, and build tests were rerun.
- **Commands actually run:** CHN harness capture/add-injection/add-stop/finalize/record;
  signed `field-lifecycle` events for create, five authenticated boots/stops, and
  destruction; owner-service exact-generation destroy; completion transitions;
  `npm run test:chn001 -- --reporter=verbose`; `npm run test:completion --
  --reporter=verbose`; `npm run validate:completion`; `npm run
  validate:evidence-artifacts`; `npm run scan:evidence-artifacts`; `npm run
  validate:repository`; `npm run validate:field-contract`; `npm run validate:plan`;
  `npm run typecheck`; `npm run build`; and `git diff --check`.
- **Results and evidence class:** CHN-001 passed using one signed
  `hyperv_host_guest` artifact, `chn001-run-407a194c9685`. CHN suite 32/32,
  completion suite 106/106, reconciliation 6/6, and all validation commands passed.
  Personal MVP proven completion increased from 25.35% to 32.39%; production proven
  completion increased from 19.15% to 24.47%.
- **Assumptions and unvalidated areas:** CHN proves authenticated channel/readiness
  invalidation and exact-Field stops only. Scene, action execution, recording, Teach,
  Shadow, Pilot, MCP, owner acceptance, performance, compatibility, security,
  reliability, and production remain gated independently.
- **Security and privacy impact:** no screenshot bytes, private UI text, credentials,
  channel secrets, demonstration bytes, or tokens entered logs or commits. The
  evidence and promotion were sealed with host/ledger custody and TPM participation;
  the distinct technical-review key co-signed the pass transition.
- **Rollback or disable path:** do not rewrite append-only evidence. If review or
  evidence is invalidated, append the contract-permitted revocation/remediation
  transition. The exact disposable generation is already destroyed; the immutable
  base remains unchanged and read-only.
- **Next recommended slice:** begin M2 with SCN-001 live scene-observation evidence,
  preserving the newly proven CHN identity, boot, replay, freshness, lock, Secure
  Desktop, display, and emergency-stop boundaries.

## Field-specific answers

- **Environment or Glove authority:** environment authority only; Glove authority did
  not change.
- **Generation invalidation:** generation 3 was stopped, destroyed by the owner
  service, and signed destroyed. Reuse is rejected by the lifecycle verifier.
- **Pilot policy:** the pilot cannot create or expand policy.
- **Recording consent/visibility:** recording was inactive; both stop receipts state
  `recordingStopped: false`. No recording capability or consent path changed.
- **Cross-boundary data:** the Field used the private isolated switch with host LAN and
  inbound access disabled. No host/other-Field artifact transfer was introduced.
- **Failure behavior:** replay, sequence rollback, wrong key/direction/generation,
  reboot, heartbeat loss, lock, Secure Desktop, display mismatch, healthy stop, and
  degraded stop all failed closed or stopped the exact VM as specified. Overflow and
  uncertain external effects remain outside this gate and receive no new claim.
- **Storage touched:** disposable overlay, personal state, and task disk for exact G3
  were destroyed. The base was never writable and its final digest matched.
- **Separated evidence:** authenticated channel/readiness and host stop are proved by
  CHN. Isolation/lifecycle is referenced from HYP and the signed G3 lifecycle.
  Recording, prediction, and execution remain separately unproven.

## Audit notes

The first finalized selection (`6c2df0fb...`) was rejected by independent review
because required messages preceded the signed boot boundary. The replacement selected
a same-boot post-signature runtime restart and all five accepted messages fall inside
the signed window. The rejected artifact is excluded from the evidence store.

One attempted pass transition used the slash-prefixed reviewer task path. Schema
validation rejected it before ledger write. Its ledger-key custody attestation remains
valid append-only history; the successful event uses canonical principal
`root:chn001_independent_review`.
