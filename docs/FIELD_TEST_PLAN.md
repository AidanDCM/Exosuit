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

The base-image matrix must additionally prove that the Field guest service is
Manual in the sealed base, cannot start during `specialize`, and becomes
Automatic only through the reviewed SetupComplete path. A boot that configures
development access before Setup completes is a failed generation.

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

### Local owner lifecycle service

Source and installation tests must prove:

- LocalSystem service identity and separate owner/service authority;
- an expiring owner policy no longer than 180 days;
- exact installed host-config and lifecycle-script hashes before every job;
- only `provision`, authenticated read-only `observe`, and `destroy` operations;
- exact Field ID/generation, policy ID, source head, timestamps, and plan digest;
- no arbitrary command, executable, script path, policy, consent, recording, key,
  export, mode, full-control, or MCP field;
- atomic package publication and duplicate/replay denial;
- job-package and guest-seed reparse denial;
- active-Field capacity denial;
- process-tree cancellation when the service stops;
- removal of the exact consumed job package without claiming forensic erasure;
- uninstall confinement and evidence preservation.

Live installation is F4 host evidence only. It does not promote Field lifecycle until
one exact provision/destroy run proves installed hashes, generation confinement, base
immutability, evidence, cancellation, and rollback behavior.

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

The runtime launcher uses an SCM-managed automatic LocalSystem service because two disposable generations retained structurally valid scheduled-task files without reaching fresh bootstrap. The service executable accepts only `--field-guest-service`, verifies LocalSystem, launches one fixed PowerShell path with fixed script/configuration arguments and no shell, kills the entire child tree on stop, and is configured for bounded delayed recovery. Installation removes the legacy task. Windows may persist a no-space executable path with or without redundant surrounding quotes, so verification permits exactly those two serializations of the same fixed executable and argument and rejects every other command. A read-only v15 inspection proved that normalization behavior plus LocalSystem, automatic start, own-process type, and recovery settings. Live acceptance still requires a completed base seal, task absence, first bootstrap/enrollment, authenticated KVP readiness, graceful reboot, hard-stop recovery, and independent host emergency stop on a fresh generation.

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

## 24. v20 development-access canary evidence (2026-07-30)

- Base v20 receipt: service staged `ManualUntilSetupComplete`, SYSTEM identity,
  network detached, non-built-in accounts absent, one-use authorization and
  bootstrap unattend consumed.
- Audit seal: built-in Audit administrator, automatic Audit UI terminated,
  canonical generalize/OOBE/shutdown Sysprep.
- Generation: exact Field `7fad0376-68aa-4300-899d-a2ded6e1fb15`, generation 1,
  isolated networking, read-only base plus disposable OS overlay and task disk.
- Authenticated readiness: handshake, zero-failure bootstrap, exact identity and
  digest bindings, display contract, unlocked/non-Secure-Desktop session, and
  heartbeat `ready`.
- Repeated observation: unchanged retained handshake/bootstrap records accepted
  idempotently only after fresh signature/expiry verification; heartbeat advanced
  strictly from host sequence `1785449589383193` to `1785449589383218`.
- Destruction: exact Generation 1 VM registration and disposable root removed;
  post-destruction v20 digest remained `452790e...547d` and read-only.
- Held: production authentication, negative replay mutation/regression live
  injection, restart/key rotation, lock/Secure Desktop, heartbeat loss, VM
  suspend/resume, repeated create/destroy, repeated/faulted base immutability, input,
  recording, and emergency stop.

## 25. Compiled KVP observation negative contract

The Windows agent owns one atomic `--field-observe-kvp-snapshot` operation. Tests
must prove:

- handshake, bootstrap, and heartbeat authenticate together with correct types;
- an exact retained snapshot is idempotent;
- an advancing heartbeat commits a strictly greater last sequence;
- a validly signed mutation at an old/equal sequence is denied;
- reuse of any previously accepted message ID is denied;
- wrong Field/key identity, malformed state, invalid entry shape, and duplicate
  identities fail closed;
- rejected snapshots leave the prior observation ledger byte-for-byte unchanged;
- the PowerShell reader delegates the complete transition to the compiled agent.

Passing unit/source evidence does not substitute for a fresh published-agent
live canary or live mutation/restart/key-rotation injection.

## 26. v21 compiled-ledger live evidence (2026-07-31)

- Exact source/publish binding: commit `454fc85`; self-contained agent digest
  `c9cf91e...ba40`; immutable v21 digest `e74c7fe...7265`.
- Provisioning: exact preview passed; isolated development generation used one
  disposable overlay and one disposable task disk.
- Restart: graceful shutdown only, no force; new boot ID; durable enrollment
  remained valid after manifest expiry; authenticated readiness passed after
  bounded retries.
- Repeated observation: retained handshake/bootstrap message IDs and envelope
  digests remained exact; heartbeat message ID and ledger sequence advanced.
- Live-captured negatives: payload tampering, valid equal sequence, and valid
  accepted-message-ID reuse all failed with byte-identical durable ledger state.
- Destruction: exact VM registration and generation root removed; base remained
  read-only and SHA-256-identical.
- Adapter regression: Windows PowerShell 5.1 requires `[object[]]` normalization
  of `ConvertFrom-Json` array output before indexing. The script requires exactly
  three verifier results and the Windows-only test executes that behavior.

Held: protected key rotation, corrupt protected ledger on the live host,
stale-generation replacement, lock/Secure Desktop, deliberate heartbeat loss,
pause/resume, production authentication, input, recording, and emergency stop.

## 27. Protected KVP observation-state contract

The durable compiled observation state must be serialized inside an authenticated
envelope. Tests must prove:

- the envelope binds a domain separator, exact Field ID/generation, channel key
  ID, algorithm, and payload;
- authentication is verified before the ledger payload is trusted;
- state files and encoded payloads are bounded before decoding;
- a well-formed tag or payload mutation fails closed;
- changing the channel key or Field generation cannot reuse old state;
- every rejected read leaves the preexisting state byte-for-byte unchanged;
- no plaintext fallback, silent migration, automatic rotation, or model-facing
  administrative path exists.

Current evidence includes focused .NET execution and the bounded v22 live
copy-based fault canary. A later canary must still prove owner-authorized key
rotation and rejection of prior state after an actual Field-generation
replacement rather than a mutated generation field.

## 28. v22 protected-state live evidence (2026-08-01)

- Exact source/publish binding: commit `6de98c9`; self-contained agent digest
  `520e4861...755`; immutable v22 digest `4c8fbe97...b71`.
- Provisioning: exact preview passed; isolated development generation used one
  disposable OS overlay and one disposable task disk.
- Readiness: the premature probe failed because handshake was absent; a bounded
  retry authenticated bootstrap `ready` without weakening freshness.
- Protected envelope: live state reported contract 1, `hmac-sha256`, exact Field
  ID/generation, and exact key ID.
- Copy-based negatives: authentication-tag corruption, payload corruption,
  wrong key ID, stale-generation metadata, plaintext legacy state, and a
  32-KiB-plus-one state were all rejected. Each rejected file remained
  byte-identical and the authoritative ledger hash did not change.
- Recovery/advance: the untouched authoritative ledger later authenticated under
  the same key and advanced from sequence `1785531727455426` to
  `1785531727456680` with a new protected-state digest.
- Destruction: exact VM registration and generation root were removed; the base
  remained read-only and SHA-256-identical.

Held: owner-authorized key rotation, actual replacement with a new Field
generation, lock/Secure Desktop, deliberate heartbeat loss, pause/resume,
production authentication, input, recording, emergency stop, and release.

## 29. Transactional channel-key rotation foundation

Source tests must prove:

- only a fresh, local, interactive `owner_local` request for
  `rotate_channel_key` can start a transaction;
- the authorization request ID, rotation ID, exact Field generation, current key
  ID, and distinct next key ID all match before provider effects;
- secret bytes never enter result or durable coordinator state; only an opaque
  provider handle crosses the coordinator boundary, and provider errors are
  redacted;
- prepare requires a bound guest acknowledgment before commit;
- failed commit reconciles to prior-active, next-prepared, next-active, or
  unknown; prepared rolls back and unknown blocks continuation;
- malformed, stale, or cross-bound provider receipts fail closed;
- committed next-key identity causes the existing replay guard to deny old-key
  traffic;
- rotation IDs cannot be replayed and hydrated state cannot contradict its last
  result.

Current evidence is pure/fake TypeScript only. Required next evidence is a
protected Windows key provider, authenticated guest prepare/commit/rollback,
crash/restart persistence, mid-flight packet injection, old-key traffic over the
live transport, and an owner-visible ceremony. No model-facing rotation tool is
authorized.

## 30. Protected rotation metadata persistence

The rotation coordinator state store must prove:

- a domain-separated HMAC binds exact Field ID/generation, algorithm, and raw
  serialized state payload;
- authentication uses fixed-time comparison before authority-state
  deserialization;
- the persisted envelope and decoded payload have explicit byte bounds;
- missing is distinct from malformed, plaintext legacy, oversized, corrupt,
  wrong-secret, cross-generation, and contradictory state;
- rejected reads do not rewrite the input;
- writes use an exclusive private temporary file and atomic replacement, leaving
  no temporary file after success;
- the integrity secret is supplied separately and never serialized.

Current evidence is pure file-component execution. It does not prove Windows
ACL enforcement, DPAPI/vault ownership, crash/power-loss atomicity, backup,
revocation, or integration with a real rotation provider.

## 31. Protected Windows channel-secret primitive

Source and local-Windows tests must prove:

- secret bytes are encrypted before persistence and are absent from the bounded
  JSON envelope;
- DPAPI uses LocalMachine scope with domain-separated entropy bound to exact
  Field ID, generation, key ID, and algorithm;
- cross-generation, wrong-key, malformed, legacy plaintext, oversized,
  non-canonical base64, weak-secret, and ciphertext-authentication failures deny;
- publication uses an exclusive flushed temporary file, seals and verifies it
  before atomic rename, preserves a prior envelope on pre-publication failure,
  and removes the failed temporary file;
- the Windows DACL disables inheritance and contains exactly LocalSystem and
  Built-in Administrators with full control;
- ordinary tests use fake protection and file-policy providers, while explicitly
  tagged local-Windows checks exercise DPAPI and the DACL implementation.

Current evidence proves the fake-provider matrix and separate local DPAPI/DACL
checks. It does not prove the combined write/rename/read path under guest
LocalSystem, directory/reparse resistance, provisioning conversion and plaintext
seed deletion, concurrent writers, crash/power-loss recovery, rotation-provider
integration, or a live owner-authorized ceremony.

## 32. Explicit channel-secret seed conversion transaction

Source tests must prove:

- caller identity is exact LocalSystem before any seed read or write;
- only the direct, case-sensitive `channel-secret.txt` child of the configured
  non-drive-root Config directory is eligible;
- Config-root and target reparse points deny;
- a seed is bounded printable ASCII, with only a trailing CR/LF normalized;
- protected-looking malformed input denies without a plaintext fallback;
- conversion uses the protected store in place, reloads the secret, compares it
  in fixed time, zeros working buffers, and returns metadata plus ciphertext
  digest only;
- a repeated invocation verifies the existing protected envelope and exact
  Field generation/key without rewriting it;
- pre-publication policy failure preserves the seed and removes temporary files.

Current evidence is a fake-provider transaction suite plus a separately tested
fixed command, validated runtime-config derivation, and protected guest-reader
wiring. It does not prove combined LocalSystem DPAPI/DACL execution or live
runtime protected-secret reads,
interruption after publication, concurrent writers, forensic secure erasure,
overlay/snapshot retirement, or live provisioning and restart.

## 33. Fixed channel-secret protection command

Source tests must prove:

- caller identity is exact LocalSystem before configuration existence, reparse,
  size, or contents are inspected;
- only the literal direct `Config/guest-runtime.json` path is accepted, without
  case changes, dot segments, alternate separators, or another filename;
- Config-root and runtime-config reparse points deny before parsing;
- configuration is nonempty, bounded, valid UTF-8 JSON with case-sensitive,
  unique, known properties and a valid Field runtime contract;
- Field generation, key ID, and exact `Config/channel-secret.txt` are derived
  solely from that configuration;
- the converter receives those exact values and the command serializes only its
  metadata receipt;
- ordinary KVP startup and provisioning do not invoke conversion.

Current evidence is a five-test source suite with an injected converter and path
inspector. It does not prove combined guest LocalSystem DPAPI/DACL execution,
configuration ACL/TOCTOU behavior, live protected-only runtime reads, startup order,
crash/power-loss recovery, secure retirement, or live restart.

## 34. Protected-only guest KVP secret reader

Source tests must prove:

- exact LocalSystem is checked before reader path or store access;
- runtime configuration and secret use their literal fixed production paths;
- Config-root and secret-file reparse points deny before store access;
- the store receives the exact Field generation and key ID;
- only bounded printable ASCII plaintext returned by the protected store is
  accepted, invalid returned buffers are zeroed, and no file-content fallback
  can occur;
- the guest emitter uses the shared strict configuration loader, calls the
  production DPAPI/DACL reader, and zeroes its loaded byte buffer on termination;
- host-side verification remains a separate secret lifecycle and never attempts
  to decrypt guest-machine ciphertext.

Current evidence is a five-test reader suite plus compiled emitter wiring. It
does not prove the combined LocalSystem DPAPI/DACL path inside a guest, managed-
string retirement, configuration/secret TOCTOU resistance, protection-command
startup ordering, restart, crash/power loss, or host protected-key storage.

## 35. Guest secret startup transaction and pre-unlock observation

Static and script tests must prove:

- one bootstrap precheck runs before protection, and the protection command plus
  exact receipt validation run before the guest KVP emitter;
- nonzero exit or anything other than exactly one JSON receipt stops startup;
- receipt top-level and nested Field schemas are exact;
- receipt version, Field ID/generation, key ID, converted/already-protected
  status, lowercase ciphertext digest, and completion freshness are checked;
- the receipt is captured, not printed or placed in the runtime error log;
- any failure prevents emitter launch and therefore prevents heartbeat;
- a valid already-protected receipt permits idempotent restart;
- a locked session may start authenticated KVP only as non-ready/provisioning;
  bootstrap continues refreshing until `session_unlocked` passes;
- early guest exit, bootstrap failure, and desktop timeout stop the exact guest
  child before launcher denial.

Current evidence includes PowerShell parser success, static order/validation
tests, and a Windows PowerShell subprocess harness. The harness executes the
launcher with inert injected process adapters: converted and already-protected
receipts reach the emitter, while nonzero protection exit, malformed receipt,
and post-publication/no-receipt interruption stop before emitter invocation. A
locked-then-unlocked harness proves the emitter starts after receipt but before
unlock, and a never-unlocked harness proves explicit child cleanup. Exact v23
live evidence diagnosed the old ordering delay but does not validate the
corrected source. A new immutable-base canary remains required.
