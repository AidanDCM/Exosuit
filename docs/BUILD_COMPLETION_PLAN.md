# Exosuit Build Completion Plan

**Status:** authoritative execution plan from validated repository foundation to personal MVP, daily driver, and production candidate  
**Machine-readable contract:** `docs/qa/build-completion-manifest.json`  
**Detailed test matrix:** `docs/qa/BUILD_COMPLETION_TEST_MATRIX.md`  
**Production authority:** `docs/MASTER_SYSTEM_ROADMAP.md` and `docs/qa/production-readiness.json`

## 1. Purpose

This plan converts the remaining Exosuit work into an ordered, evidence-gated completion program. It separates three finish lines:

1. **Personal MVP** — one owner can install Exosuit, connect ChatGPT or the bounded API fallback, operate five supported low-risk workflows inside a disposable Field, approve consequential actions, interrupt and resume tasks, and obtain verified results.
2. **Strong daily driver** — the MVP remains dependable over sustained use, failures, restarts, resource pressure, application variation, and at least one hundred representative trials.
3. **Production candidate** — signed and reproducible artifacts, hardened keys, privacy and security review, supported-machine testing, monitoring, incident response, update/rollback, and explicit owner approval are complete.

Passing source tests is not live acceptance. Passing live acceptance is not production approval. The system remains denied at every later level until the exact gate for that level passes.

## 2. Permanent architecture rule

> ChatGPT or an API model handles intent, judgment, and conversation. Exosuit handles state, execution, safety, memory, recovery, and evidence.

MCP is the tool connection, not the AI brain. ChatGPT MCP is the preferred interactive route. The OpenAI API route is a bounded fallback for approved unattended continuation, recovery, local-cockpit initiation, or temporary MCP unavailability.

Both routes must share:

- the same high-level task contracts;
- the same local policy and approval engine;
- the same task/session persistence;
- the same persona versions;
- the same trusted execution adapter;
- the same audit, verification, and recovery behavior;
- the same emergency stop.

Neither brain route may directly manufacture owner approval, Field readiness, credential authorization, execution success, or production promotion.

## 3. Current baseline

The repository foundation includes:

- Glove policy, proposal, approval, verification, recovery, audit, workflow, and emergency-stop foundations;
- Field identity, lifecycle, provisioning plans, authenticated channel, heartbeat, readiness, scene, Teach, Shadow, Correction, artifact, privacy, and recovery foundations;
- encrypted persona, governance, model, activation, and product-task persistence;
- high-level product task recipes and MCP contracts;
- cockpit state contracts;
- deterministic preflight and readiness benchmark evaluation;
- signed release-manifest and non-executing lifecycle plans;
- comprehensive fake, unit, TypeScript, .NET, build, pulse, dependency, and SBOM validation.

The remaining critical path is live integration and proof, not additional abstract authority layers.

## 4. Evidence classes

Every test must state its highest evidence class:

| Class | Meaning |
|---|---|
| `source` | Static source or document invariant |
| `unit` | Pure or isolated automated test |
| `fake_integration` | End-to-end simulated provider or system pulse |
| `windows_guest` | Evidence from the real Windows guest session |
| `hyperv_host_guest` | Evidence spanning the real host, Hyper-V, guest, storage, and channel |
| `chatgpt_mcp` | Evidence from a normal private ChatGPT MCP connection |
| `owner_acceptance` | Owner-observed workflow or usability acceptance |
| `security_review` | Security/privacy review, scanning, or adversarial testing |
| `release_operations` | Installer, signing, update, rollback, monitoring, or operations evidence |

A gate requiring live evidence cannot pass with synthetic-only evidence. A live pass requires:

- the exact commit SHA;
- the test/run reference;
- timestamped evidence;
- the Field ID and generation where applicable;
- the active policy/profile/task versions where applicable;
- observed result and failure behavior;
- rollback or containment outcome.

## 5. Completion phases

### M0 — Exact source baseline

**Objective:** maintain one reproducible and security-reviewed source baseline before live changes.

**Build work**

- Keep all current validators, tests, builds, pulses, audits, and SBOM generation green.
- Validate `docs/qa/build-completion-manifest.json` on every relevant change.
- Keep production-readiness and personal-MVP promotion denied by default.
- Record every defect found by CI and rerun the full matrix after repair.

**Required tests**

- `SRC-001` exact-head repository and build validation.
- `SRC-002` dependency, vulnerability, and SBOM validation.
- `SRC-003` completion-gate integrity.

**Exit**

- One exact commit passes the complete source matrix.
- No source or dependency failure is hidden by shell piping or skipped reporting.
- The next permitted phase is M1 only.

### M1 — Real host and Field substrate

**Objective:** prove the actual Windows host can create, authenticate, observe, stop, reset, and destroy one disposable Hyper-V Field safely.

**Build work**

1. Run host preflight collection without mutating the machine.
2. Resolve Windows edition/build, firmware virtualization, Hyper-V, CPU, memory, disk, Node, .NET, image integrity, encryption, and brain-route blockers.
3. Provision a Generation 2 Field from the immutable base and disposable overlay.
4. Attach only the exact approved personal-state generation and disposable task disk.
5. Start the guest service and authenticated channel.
6. Bind readiness to boot ID, Field generation, display, session state, heartbeat, policy, and attestation.
7. Wire the independent emergency-stop path.
8. Repeat the full lifecycle at least three consecutive times.

**Required tests**

- Host preflight and remediation.
- Create/start/ready/stop/reset/destroy/recreate.
- Immutable-base and parent-chain verification.
- Exact-generation destruction confinement.
- Wrong Field/personal-state/task-disk identity.
- Replay after restart, wrong direction/key/nonce/sequence/timestamp.
- Guest reboot and boot-ID change.
- Lock, Secure Desktop, display mismatch, heartbeat loss, guest crash.
- Emergency stop during healthy, degraded, recording, and executing states.

**Exit**

- `HYP-001` and `CHN-001` pass with real host/guest evidence.
- No test mutates the immutable base or deletes an unconfirmed path.
- Readiness clears before any action can proceed after a trust failure.

### M2 — Live scene and trusted execution

**Objective:** establish a reliable real-desktop observation and action loop that verifies effects and stops safely when uncertain.

**Build work**

1. Connect the real guest Windows UI Automation scene producer.
2. Produce fresh scene/window/control generations and modal/focus state.
3. Implement the trusted local task-chunk adapter behind the existing high-level task engine.
4. Execute semantic UI Automation actions first.
5. Permit physical fallback only when locally enabled, allowlisted, budgeted, and fresh-scene bound.
6. Re-observe after meaningful actions and verify expected results.
7. Persist the latest verified checkpoint and uncertain-effect state.
8. Complete confined artifact import/export with final-destination verification.

**Required tests**

- Scene matches active application and controls.
- Window moved, resized, closed, covered, or changed between plan and action.
- Modal popup and focus theft.
- Locked session and Secure Desktop.
- Semantic action success and unsupported-control fallback.
- Physical fallback disabled and enabled cases.
- Policy, Field generation, scene generation, target, and action-budget mismatch.
- Slow application, timeout, partial effect, duplicate effect, and uncertain effect.
- Crash and restart at every action boundary.
- Path traversal, reparse point, hash mismatch, TOCTOU, and sensitive export.

**Exit**

- `SCN-001` and `ACT-001` pass on the real guest.
- Every supported action reaches `verified`, `needs_owner`, `safely_aborted`, or `rolled_back`.
- No uncertain effect is retried blindly.

### M3 — Teach, Shadow, and personal learning

**Objective:** safely collect real demonstrations, evaluate predictions, and promote owner-approved personal models without granting input authority.

**Build work**

1. Implement live Teach recording with explicit consent and persistent visible state.
2. Ensure the recorder cannot inject input.
3. Apply visual-region approval, credential exclusion, redaction, byte budgets, retention, and deletion.
4. Segment demonstrations into exact provenance-bound episodes.
5. Run Shadow in a separate capability boundary with no input, credential, command, approval, network, or Field-administration authority.
6. Compare predictions with owner actions and capture corrections.
7. Train/evaluate task, attention, motor, typing/editing, timing, language, and verification models separately.
8. Require held-out evaluation and explicit owner promotion.

**Required tests**

- Recording cannot start without consent.
- Indicator and independent stop survive model/channel failure.
- Hook disconnect, event overflow, visual budget exhaustion, retention expiry.
- Credential-bearing controls and excluded regions.
- Deletion propagates through encrypted blobs, indexes, models, bundles, and certificates.
- Shadow process capability denial.
- Prediction/actual scene mismatch and Field-generation mismatch.
- Train/evaluation separation and provenance.
- Model rollback, deactivation, revocation, and delete.

**Exit**

- `TCH-001` and `SHD-001` pass.
- At least one useful held-out personal model beats its documented baseline.
- No personal model can weaken policy, verification, approval, deadlines, audit, isolation, or stop.

### M4 — Assisted recipe MVP

**Objective:** execute the five reviewed low-risk workflows through one trusted adapter, with meaningful approvals and measured recovery.

**Initial recipes**

1. Gather approved information.
2. Research, normalize, deduplicate, and organize.
3. Fill a form and stop before submission.
4. Prepare a message and stop before sending.
5. Download and organize approved files.

**Build work**

- Connect product task chunks to the trusted execution adapter.
- Bind each chunk to task hash, checkpoint, Field, scene, policy, recipe, and expiry.
- Reauthorize downstream actions after scene or policy change.
- Use automatic approval only for harmless local work.
- Use one grouped approval for reversible low-risk chunks.
- Request immediate owner approval for sending, submitting, uploading, sharing, deletion, account changes, credentials, identity-sensitive communication, financial/legal/destructive actions, and external commitments.
- Exercise the complete failure matrix for each recipe.

**Required tests**

- `AST-001` trusted-adapter-only outcomes.
- `RCP-001` all five live recipes.
- Popup, latency, disconnect, crash, stale state, changed target, expired approval, replayed chunk, and uncertain effect.
- Correct stop-before-submit and stop-before-send behavior.
- Approval grouping and consequential reapproval.
- Emergency stop and task reset during each recipe.

**Exit**

- Every recipe completes at least once live.
- No MCP/model route can report execution success without a trusted verified receipt.
- No consequential action occurs without the required owner approval.

### M5 — ChatGPT, API fallback, cockpit, and resume

**Objective:** make Exosuit usable as a normal personal product rather than a developer workflow.

**Build work**

1. Establish a private authenticated ChatGPT MCP connection.
2. Validate `core`, `product`, and `full` tool discovery separately.
3. Build the in-chat task/progress/approval presentation.
4. Configure bounded API fallback with explicit model-call and cost ceilings.
5. Build the Windows tray/cockpit interface against the existing privacy-safe contract.
6. Connect pause, resume, cancel, reset, emergency stop, approvals, task history, Field status, brain status, and recovery choices.
7. Resume tasks after ChatGPT, MCP tunnel, local service, guest, and host interruptions.

**Required tests**

- Expected MCP tools only; unknown surface fails startup.
- Read-only and mutating action hints are correct.
- MCP reconnect, expiry, replay, revocation, and concurrent-session handling.
- API fallback only in approved conditions and within budget.
- Cockpit never displays/logs forbidden secrets or raw private state by default.
- Keyboard navigation, clear mode/recording state, emergency control visibility.
- Restart/resume at every task checkpoint.

**Exit**

- `MCP-001` and `CPK-001` pass.
- One owner can complete a supported workflow from ChatGPT and recover from interruption without using a terminal or Hyper-V Manager.

### M6 — Installable personal MVP

**Objective:** produce an installable personal system and pass the minimum live benchmark.

**Build work**

- Convert non-executing lifecycle contracts into a signed development installer.
- Install/start the local supervisor, Field services, tray/cockpit, configuration, and tunnel integration.
- Implement repair, update, failed-update rollback, uninstall, and optional verified owner-data deletion.
- Run the personal-MVP acceptance suite on the exact installed build.

**MVP threshold**

- At least 10 live trials.
- All five recipes represented.
- At least 90% completion.
- Zero unapproved consequential actions.
- Emergency stop succeeds in every attempted acceptance trial.
- At least 90% session-resume success.
- No more than 0.3 non-required owner interventions per trial.
- Complete task evidence for every trial.

**Exit**

- `INS-001` and `OWN-001` pass.
- The exact installed build, not a developer checkout, meets the benchmark.
- Personal MVP may be explicitly approved; production remains denied.

### P1 — Strong daily-driver reliability

**Objective:** prove sustained operation beyond minimum viability.

**Required benchmark**

- At least 100 representative live trials.
- At least 97% completion.
- At least 95% successful recovery when recovery is attempted.
- At least 99% session-resume success.
- No more than 0.1 unnecessary interventions per trial.
- Zero unapproved consequential actions.

**Additional testing**

- Long-running soak.
- Queue saturation and backpressure.
- Disk pressure and storage corruption.
- Host/guest/service/model/network failures.
- Repeated update/rollback.
- Supported Windows build, display, scaling, and application matrix.

### P2 — Production security and release engineering

**Objective:** independently prove security, privacy, key management, and release integrity.

**Build and test**

- DPAPI/TPM key sealing, rotation, recovery, revocation, and secure deletion.
- Private code scanning and binary scanning.
- Supply-chain and provenance validation.
- Penetration testing of host, guest, channel, MCP, credentials, artifacts, update, and approval paths.
- Prompt-injection and malicious-content testing.
- Privacy inventory, retention, export, deletion, and breach procedures.
- Signed reproducible Windows binaries, installer, manifests, npm SBOM, .NET SBOM, and provenance.

**Exit**

- `SEC-001` and `REL-001` pass.
- No unresolved Critical or High release blocker.

### P3 — Production operations and exact candidate

**Objective:** approve one exact signed candidate with operational support.

**Build and test**

- Monitoring and alerting.
- Crash and health diagnostics without sensitive leakage.
- Incident triage, containment, communication, and recovery exercises.
- Backup, personal-data recovery, and clean rebuild.
- Support and escalation runbooks.
- Complete exact-candidate install, upgrade, rollback, uninstall, compatibility, failure injection, ChatGPT, and owner workflow matrix.

**Exit**

- Every production gate is `pass` with evidence.
- Development access and unattended setup are disabled.
- Unresolved blockers are empty.
- Owner approval and production decision are explicit.
- `npm run validate:production` passes the exact signed candidate.

## 6. Live evidence bundle

Each live test run should write a confined evidence directory:

```text
artifacts/completion/<commit>/<test-id>/<run-id>/
  run-manifest.json
  environment.json
  field-identity.json
  policy-summary.json
  task-summary.json
  approvals.json
  verification.json
  recovery.json
  audit-digest.json
  result.json
  redacted-logs/
```

The run manifest should include:

- contract version;
- test ID;
- exact commit and build version;
- run ID and timestamps;
- operator/owner approval reference without exposing unnecessary identity data;
- host and guest build identifiers;
- Field ID/generation and boot ID;
- policy, recipe, profile, model, and task hashes;
- evidence class and whether synthetic;
- expected result;
- observed result;
- pass/fail/block decision;
- rollback or containment performed;
- redaction status;
- integrity hash.

No evidence bundle may contain credentials, authentication tokens, raw cookies, unapproved screenshots, raw private UI values, or unrestricted personal data.

## 7. Defect procedure

When a test fails:

1. Stop the active task and prevent dependent tests.
2. Preserve the minimum redacted evidence needed to reproduce the failure.
3. Classify whether the effect is verified absent, verified present, or uncertain.
4. Never retry an uncertain external effect blindly.
5. Roll back or quarantine the exact affected Field/task/release generation.
6. Record the root cause and affected gate IDs.
7. Implement one bounded repair.
8. Run the focused regression tests.
9. Rerun the complete phase matrix from its first prerequisite.
10. Update the completion manifest only after exact evidence exists.

## 8. Promotion rules

- A phase cannot complete before all dependency phases complete.
- A test cannot pass without evidence at or above its required evidence class.
- A live test cannot pass with synthetic-only evidence.
- Critical and High tests cannot be waived for a promoted capability.
- A lower-level pass never implies a higher-level pass.
- Personal MVP, daily driver, and production each require separate explicit evaluation.
- Production remains denied even if every source-level contract passes.
- Owner approval cannot be inferred from model text, successful automation, or repository changes.

## 9. Immediate execution sequence on the target machine

1. Check out the exact validated branch and run the complete source validator.
2. Run non-mutating host preflight and save `HYP-001` evidence.
3. Resolve all preflight blockers.
4. Create one disposable Field and execute M1 lifecycle/failure tests.
5. Connect live scene production and execute M2 observation tests before enabling input.
6. Connect semantic execution, then guarded physical fallback, verification, checkpoints, and artifact transfer.
7. Run Teach privacy acceptance and process-isolated Shadow tests.
8. Collect enough demonstrations for held-out personal-model evaluation.
9. Connect the trusted Assisted adapter and execute each recipe independently.
10. Connect private ChatGPT MCP and validate exact tool discovery.
11. Add the cockpit and run interruption/resume/human-factors tests.
12. Build the installer and run the ten-trial MVP benchmark on the installed build.
13. Only after explicit MVP approval, begin the 100-trial daily-driver matrix.
14. Only after daily-driver acceptance, begin production security and release review.

## 10. Definition of complete

**Personal MVP is complete** only when M0 through M6 pass with required live evidence and explicit owner approval.

**Strong daily driver is complete** only when M0 through P1 pass with sustained benchmark and compatibility evidence.

**Production is complete** only when every M and P phase passes on one exact signed candidate, the production manifest has no blocker, operational rehearsals pass, and the owner explicitly approves release.
