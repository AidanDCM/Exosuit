# Exosuit Field Test Plan

**Authority:** `docs/MASTER_SYSTEM_ROADMAP.md`  
**Applies to:** Exosuit Field and the authenticated Field boundary with the Glove  
**Shared companion:** `docs/TEST_PLAN.md`

## 1. Purpose

This plan defines the evidence required to promote Field capabilities from source foundation to production. It proves the Field independently from the Glove and then proves the combined boundary.

A Field claim must state:

- exact Field ID and generation;
- exact Glove agent and Windows session;
- exact commit and binary versions;
- Field lifecycle and mode;
- policy, attestation, key, scene, and model versions;
- command/procedure;
- expected and actual result;
- evidence level;
- artifact locations and integrity hashes;
- residual risk;
- rollback/destruction result.

## 2. Evidence levels

| Level | Meaning |
|---|---|
| F0 | static inspection only |
| F1 | TypeScript or .NET unit tests |
| F2 | fake Field integration and complete fake pulse |
| F3 | hosted target build/test and PowerShell parse |
| F4 | one disposable Hyper-V generation lifecycle |
| F5 | authenticated live host/guest channel and readiness |
| F6 | live scene and consented Teach recording |
| F7 | live artifact transfer and Shadow prediction |
| F8 | synthetic Pilot workflow |
| F9 | normal ChatGPT MCP acceptance |
| F10 | low-risk owner acceptance |
| F11 | production candidate |

Lower evidence never proves a higher level.

## 3. Current evidence boundary

Source and tests exist for identity, policy, attestation, lifecycle, desired state, channel, heartbeat, bootstrap, typed commands, Teach state, encrypted episodes, visual retention, scene, Shadow metrics, path scope, artifact manifests, recovery, diagnostics, fake pulse, and guarded PowerShell tooling.

Current-head execution, Hyper-V behavior, live recording, live prediction, personal models, and Pilot operation remain unproven.

## 4. Mandatory source validation

```bash
npm run validate:repository
npm run validate:plan
npm run validate:field-contract
npm run typecheck
npm run test:field -- --reporter=verbose
npm run test:field-pulse -- --reporter=verbose
npm test -- --reporter=verbose
npm run build
```

```powershell
dotnet restore apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj
dotnet build apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --configuration Release --no-restore -warnaserror
dotnet test apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --configuration Release --no-build
./scripts/windows/Invoke-ExosuitFieldValidation.ps1
```

## 5. Identity, display, policy, and attestation

### Positive

- valid Field identity and positive generation;
- exact agent, machine, session, base image, task disk, and optional personal-state identity;
- fixed single-monitor display;
- Teach policy with owner consent;
- Shadow policy without execution capability;
- Pilot policy with finite process, origin, capability, runtime, and action scope;
- canonical policy hash;
- short-lived HMAC attestation;
- exact identity/generation binding.

### Negative

- wrong subsystem;
- stale/zero generation;
- malformed digest or ID;
- dynamic resolution;
- duplicate process/capability;
- Teach without consent;
- host desktop/drive, privilege, or security-control access;
- invalid issue/expiry order;
- policy substitution;
- wrong generation/key/signature;
- expired/not-yet-valid attestation;
- malformed or noncanonical timestamp;
- noncanonical origin.

## 6. Field lifecycle and manager

Test every allowed lifecycle edge and every forbidden shortcut.

Required scenarios:

- plan → provision → ready;
- ready → Teach/Shadow/Pilot;
- operating mode → ready;
- stop → stopped;
- fault visibility;
- destroy only from planned/stopped/faulted;
- replacement increments generation;
- stale generation rejected;
- exact Glove binding;
- provider provision/stop/destroy failure;
- audit-chain verification;
- persistent manager recovery after process restart;
- idempotent cleanup.

The source implementation now includes a bounded, atomic, integrity-protected snapshot for registry records, policy bindings, and the complete hash-linked audit chain. Restart, missing-file, tamper, duplicate-binding, broken-chain, and size-bound cases are covered with a fake provider. Production still requires transactional live-provider checkpoint/reconciliation and crash/failure-injection evidence; a snapshot alone does not prove that a Hyper-V side effect and local state committed together.

## 7. Storage and disk identity

### Immutable base

- approved registry entry;
- exact digest before use;
- read-only parent;
- no direct writable attachment;
- unchanged hash after generation lifecycle.

### Runtime overlay

- one differencing overlay per generation;
- parent identity verified;
- disposable and generation-confined;
- removed on destruction;
- rollback cannot target parent.

### Personal state

- stable disk ID and positive generation are present together;
- host registry and provisioning plan match the exact ID/generation tuple;
- missing, partial, stale, or mismatched tuples fail before VM mutation;
- stable disk identity and version separate from mutable contents;
- encrypted at rest;
- attach only when policy allows;
- snapshot/seal process has an integrity digest;
- normal writes do not invalidate stable identity;
- migration, backup, corruption, and rollback tested;
- removal/deletion requires owner authority.

A writable personal-state disk must not rely on one permanent whole-file digest.
Hashes are reserved for sealed immutable snapshots and must not be compared to an actively writable VHDX as its permanent identity.

### Task disk

- separate disposable disk;
- exact generation binding;
- capacity and quota enforcement;
- destruction and cleanup evidence.

## 8. Hyper-V host and provisioning

### Preflight

- supported Windows edition and Hyper-V capability;
- sufficient memory/disk;
- approved storage root not equal to drive root;
- all ancestor reparse points inspected;
- approved private/disabled network mode;
- exact base/personal-state registry resolution;
- no broad host integration.

### Creation

- Generation 2 VM;
- Secure Boot;
- reviewed TPM behavior;
- bounded CPU/memory;
- immutable base + disposable overlay;
- separate personal/task disks;
- disabled/private network;
- viewer is observation only;
- start pending guest validation.

### Failure injection

- wrong digest;
- VM/directory collision;
- wrong switch type;
- disk/VM/config failure;
- typed-confirmation mismatch;
- reparse/junction attack;
- cancellation;
- rollback failure;
- host crash during apply;
- evidence write failure.

### Destruction

- exact typed confirmation;
- stop exact VM;
- remove exact VM registration;
- remove only exact generation root;
- refuse reparse traversal;
- preserve base and personal state;
- retain sanitized destruction evidence.

## 9. Authenticated channel and replay protection

Replay state must persist atomically across restart, remain bounded, and bind the exact Field generation, direction, and key ID. Signed timestamps use canonical UTC millisecond format only. Corrupt, oversized, or identity-mismatched replay state fails closed.

- one canonical UTC timestamp format;
- exact Field ID/generation and direction;
- key ID and protected key storage;
- payload hash and HMAC;
- message ID, nonce, and strictly increasing sequence;
- bounded persistent replay state;
- atomic sequence update;
- key rotation and overlap policy;
- restart/reboot handling;
- clock-skew bounds;
- corruption recovery.

Failure injection:

- payload mutation;
- wrong direction/key/secret;
- expired/future timestamp;
- message/nonce replay;
- sequence rollback;
- stale generation;
- guest reboot/crash;
- replay-store corruption;
- key rotation mid-flight.

TypeScript and .NET must accept and reject identical fixtures.

## 10. Heartbeat, bootstrap, and readiness

- boot identity;
- agent identity and binary digest;
- manifest integrity;
- first enrollment occurs only inside the manifest authorization window;
- durable enrollment binds the exact manifest digest and complete Field identity;
- an enrolled generation can reboot after manifest expiry without weakening runtime checks;
- required directory/volume layout;
- fixed display enforcement;
- session unlocked;
- Secure Desktop inactive;
- channel authenticated;
- heartbeat current;
- policy and attestation current;
- scene producer ready;
- emergency stop available.

The host cannot declare `ready` before every runtime check passes.

Failure injection:

- missing/wrong agent;
- wrong manifest/generation/display;
- expired first-use manifest without enrollment;
- enrollment with a wrong digest, identity, or out-of-window timestamp;
- missing, corrupt, or replaced enrollment after reboot;
- locked session;
- Secure Desktop;
- absent/stale heartbeat;
- boot identity change;
- old process after replacement;
- policy expiry.

## 11. Scene production

The source adapter now composes the existing Windows UI Automation observation contract with a fresh exact-generation Field heartbeat, display contract, cursor state, and explicit modal state. It rejects screenshot bytes, redacts sensitive element identity/value/actions, defaults to structural-only metadata with all UI text removed, and advances scene versions only after successful validation. A separate `consented_ui_text` policy exists but is not enabled by runtime wiring. Authenticated guest-to-host scene transport and live Windows evidence remain open.

Offline guest diagnosis now has a canonical bounded inspector. It refuses a running VM, mounts only the exact disposable overlay read-only, records file names/sizes/digests and scheduled-task metadata without copying configuration or log contents, and always attempts a bounded dismount. A live 2026-07-28 v14 run proved the agent/config files and LocalSystem boot/logon task were present, narrowing that regression to runtime startup before KVP publication.

The inspector may project a bootstrap report only through a fixed metadata allowlist: report digest and timestamp plus check names, pass/fail booleans, observation timestamps, and derived failed-check names. It must not export check summaries, evidence objects, identity payloads, configuration contents, or log contents.

Scheduled-task dispatch diagnosis is similarly allowlisted. The inspector may report task enabled/start-when-available/multiple-instance settings plus Task Scheduler event IDs, numeric levels, record IDs, and UTC timestamps filtered to the exact `\ExosuitFieldGuest` task. It must not export event messages, property values, user identities, command output, or unrelated events.

The system-generated SetupComplete log may be reduced to a fixed category (`empty`, known confirmation-binding failure, task registration/access/start failure, development-access failure, or unclassified nonempty) plus its length and digest. Raw text, matched excerpts, paths, arguments, and error messages must not leave the mounted guest.

Expired-first-use development recovery has a separate reviewed repair tool. It is not diagnostic-only: apply requires an exact off VM, exact owner confirmation, reviewed manifest/agent/initializer hashes, no existing enrollment, transactional rollback, and guaranteed dismount. Plan-only, wrong-state, wrong-hash, reparse, existing-enrollment, partial-swap, and dismount-failure cases require evidence before production use.

- top-level windows and generations;
- process identity;
- active/focused window;
- UI Automation elements and ownership;
- modal state;
- cursor/display/session state;
- input-queue ownership;
- monotonic scene versions;
- sanitized event stream;
- backpressure and large-tree handling.

Negative cases:

- close/reopen;
- process restart;
- focus stolen;
- modal appears mid-action;
- duplicate IDs;
- stale scene;
- UIA failure;
- display change;
- lock/Secure Desktop.

No mutation may use stale scene or window generation.

## 12. Teach Mode

### Consent and visibility

- explicit interactive owner consent;
- consent cannot come from MCP/model text;
- persistent recording indicator;
- independent local stop;
- immediate unhook on revoke/stop/mode exit;
- no input-injection capability.

### Input stream

- timestamped cursor, buttons, wheel, drag, keys, shortcuts, editing, focus, reading/inactivity;
- pairing and monotonic ordering;
- guest-session scope only;
- credential/sensitive content suppression;
- bounded queues and overflow behavior.

### Visual stream

- disabled by default;
- separately consented;
- window/region/change-only scope;
- redaction before persistence;
- frame/byte/time budgets;
- protected/blank surface behavior;
- encrypted external blobs;
- expiration and deletion certificate.

### Semantic/system/annotation streams

- window/UIA/process/file/download/modal events;
- task goal and success criteria;
- step, mistake, correction, changed mind, reason, success, completion, abort;
- synchronized timestamps.

### Episode persistence

- contiguous sequences and unique IDs;
- terminal episodes only;
- AES-256-GCM authenticated storage;
- wrong-key/tamper failure;
- atomic writes;
- size limits;
- source and derived deletion propagation.

## 13. Demonstration processing and retrieval

The source foundation has a deterministic `semantic_step` annotation processor, exact event lineage, strict non-overlapping ranges, mistake/correction labels, operator/layout-scoped similarity retrieval, source deletion, and deterministic held-out partitioning. Derived records now have a bounded AES-256-GCM file store, authenticated source/Field/pipeline identity, atomic private writes, restart hydration, and a corpus wrapper that deletes derived behavior before raw source. Automatic grounding, migration, Windows key protection, and real-data quality evidence remain open.

- integrity/privacy validation;
- event synchronization;
- step segmentation;
- target grounding;
- intent/reason and mistake/correction labels;
- task/motor/typing/timing features;
- episode index;
- similar-example retrieval;
- versioned processing pipeline;
- held-out split;
- deletion propagation;
- provenance from derived record to source episodes.

Failure cases:

- corrupted episode;
- missing stream;
- ambiguous target;
- conflicting annotation;
- sensitive residual;
- deleted source;
- stale feature schema.

## 14. Shadow Mode

The source foundation now includes a synchronous retrieval-only baseline. It binds the exact Field/observation/layout, predicts from same-operator successful preferred/correction examples, records source episodes, and abstains for unsafe desktop state, unexpected modal state, no match, or low heuristic confidence. Both result variants structurally hard-code `executionAllowed: false`. This is not calibrated on owner data and is not process-level live isolation evidence.

- process-level proof of no semantic or physical input authority;
- exact scene/generation binding;
- intent, target, method, timing, expected result, confidence, and optional trajectory prediction;
- timeout never blocks owner input;
- low confidence abstains;
- actual action and result alignment;
- incorrect predictions retained;
- model/version provenance.

Metrics:

- intent, target, method, result agreement;
- workflow-order distance;
- timing error by context;
- trajectory/scroll/typing distributions;
- correction behavior;
- calibration and abstention;
- changed-layout, popup, and interruption performance.

## 15. Correction and personal models

The source foundation now records one correction per exact Shadow prediction, binds replacement behavior to the same Field generation and observation, distinguishes system error from changed mind, exploration, and cancellation, preserves uncertain external-effect state, and structurally disables execution. It does not yet stop a live motor path, persist encrypted corrections, replay them in a fresh Field, or prove owner-data improvement.

- owner takeover and correction capture;
- distinction between mistake, exploration, changed mind, and preferred alternative;
- task/attention model evaluation;
- motor bounds, cancellation, finite paths, and fallback motor;
- typing/editing process evaluation;
- timing-state calibration;
- language-style evaluation with identity-sensitive review;
- correction and verification models;
- model manifests, training episodes, exclusions, code/schema version, evaluation, rollback, retention;
- deletion propagates to retraining/derived products.

No personal model may weaken Field isolation, policy, verification, audit, deadlines, or stop.

## 16. Assisted Mode and personal skills

- bounded skill manifest;
- exact applications/origins/capabilities;
- maximum steps/duration/risk;
- required verification and recovery;
- local enable/disable/revoke;
- permission diff on upgrade;
- simulation before install;
- owner correction and takeover at any point;
- repeated workflow reliability on held-out variants.

## 17. Artifact broker

- fixed Inbox/Workspace/Downloads/Outbox/Quarantine roots;
- reject absolute, drive, UNC, traversal, ADS, invalid/reserved, trailing-dot/space paths;
- inspect reparse ancestry at time of copy;
- mitigate TOCTOU;
- stage imports and exports;
- exact byte count and SHA-256 at both ends;
- collision policy;
- cancellation/partial cleanup;
- quarantine/reclassification;
- separate owner-reviewed sensitive export;
- guest/host crash recovery.

## 18. Credential broker

- owner creates account/origin binding;
- no raw secret returned to model or normal logs;
- exact origin/account/process verification;
- session expiration/revocation;
- recovery code and MFA handling remains owner controlled;
- wrong origin/account/process denied;
- credential fields excluded from Teach/visual/artifact capture.

## 19. Pilot Mode

### Authorization

- exact signed policy and attestation;
- authenticated Glove host actor;
- exact generation/session;
- healthy heartbeat and scene;
- exact policy ID/hash;
- contiguous action ordinal and remaining budget;
- approved process/origin/route/capability;
- expected result and verification;
- emergency stop independent of normal channel.

### Synthetic workflow

Using only the local deterministic fixture:

- launch browser/test application through desktop controls;
- search and inspect results;
- wait for delayed readiness;
- handle modal;
- enter harmless text;
- produce synthetic download;
- organize Workspace;
- export verified artifact;
- stop and destroy generation.

### Failure/recovery

- stale scene/policy/generation;
- unsupported route;
- budget exhaustion;
- no-effect action;
- possible unverified effect;
- slow load;
- focus theft;
- popup/layout change;
- agent/heartbeat loss;
- session lock/Secure Desktop;
- VM suspend/resume;
- supervisor restart;
- emergency stop during physical input.

No blind retry is allowed after a possible external effect.

## 20. ChatGPT and owner acceptance

- reviewed read/status/observation/task tools only;
- no model-facing provisioning, consent, key rotation, deletion, sensitive export, credential administration, or arbitrary shell;
- normal ChatGPT conversation reaches the Field through the Glove;
- local policy and approval remain authoritative;
- verified result before success claim;
- complete sanitized audit;
- low-risk owner tasks only after synthetic Pilot passes;
- owner can identify mode, Field generation, current action, recording state, and stop control.

## 21. Reliability, performance, and operations

- long-running soak tests;
- repeated create/destroy cycles;
- restart/reconnect/recovery;
- storage migration and corruption;
- audit verification;
- CPU, memory, disk, network, scene, recording, and model resource budgets;
- latency percentiles;
- overload/backpressure;
- signed installer and binaries;
- SBOM and lockfiles;
- update/rollback/uninstall/data removal;
- incident response and key revocation;
- compatibility matrix;
- penetration test;
- privacy inventory and retention matrix.

## 22. Production gate

Production is denied until one exact signed release candidate has:

- passed current-head source and target builds;
- passed Hyper-V, channel, readiness, scene, Teach, artifact, Shadow, Correction, model, Assisted, and synthetic Pilot evidence;
- passed ChatGPT and low-risk owner acceptance;
- passed security, privacy, deletion, performance, packaging, rollback, and operations;
- no unresolved critical/high findings;
- owner-signed production decision.

## 23. Current verdict

See `docs/qa/PRODUCTION_READINESS_ASSESSMENT_2026-07-22.md`.

Current Field production status: **DENIED**.
