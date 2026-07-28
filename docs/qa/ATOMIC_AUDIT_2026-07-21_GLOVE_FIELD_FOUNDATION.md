# Forensic Atomic Audit — Glove and Field Foundation

**Audit level:** 4 — Forensic Atomic Audit  
**Audit start:** 2026-07-21T13:32:27-04:00  
**Repository:** `AidanDCM/Exosuit`  
**Branch:** `agent/field-foundation`  
**Base:** `build/exosuit-mvp`  
**Scope:** introduce an explicitly separate Exosuit Field subsystem beside the existing Exosuit Glove and implement the first contract, lifecycle, demonstration, documentation, and test slice.

## 1. Audit Scope

This audit reviews the first Field foundation slice only. It does not audit a live VM, live recording, model training, or Pilot operation because those capabilities do not exist in this slice.

Included:

- Glove/Field responsibility boundary,
- Field identity and generation,
- display contract,
- Field policy and local attestation,
- Field lifecycle registry,
- demonstration episode and redaction foundation,
- Windows-side pure foundation,
- TypeScript and .NET tests,
- owner/developer/test manuals,
- Parts & Pieces traceability,
- repository validation integration plan.

Excluded but tracked as missing pieces:

- Hyper-V provisioning,
- guest bootstrap,
- host/guest transport,
- Teach input and visual capture,
- scene graph,
- Shadow prediction,
- learned motor/typing/language/timing profiles,
- credential broker,
- artifact broker,
- Pilot autonomous Field integration,
- local/connected/production evidence.

## 2. Evidence Register

| Evidence | Type | Supports | Limitation |
|---|---|---|---|
| existing `docs/ARCHITECTURE.md` | source documentation | current Glove architecture and agent-in-session rule | predates Field implementation |
| existing `docs/MASTER_SYSTEM_ROADMAP.md` | planning authority | VM/multi-agent direction and evidence rules | some status text requires future reconciliation |
| Parts & Pieces `ATOMIC_AUDIT.md` | doctrine | required audit structure and manualization | donor doctrine is not Exosuit runtime proof |
| Parts & Pieces `QUESTION_EVERYTHING_PROTOCOL.md` | doctrine | atomic questions, ledgers, traceability | donor doctrine is not implementation proof |
| `src/fieldContracts.ts` | source | identity, display, policy, attestation | not yet command-validated |
| `src/fieldRegistry.ts` | source | Field lifecycle and Glove binding | in-memory only |
| `src/demonstration.ts` | source | consent-bound episodes, ordering, limits, redaction | no persistence or live hooks |
| `apps/windows-agent/FieldFoundation.cs` | source | Windows-side identity/display/lifecycle/redaction | pure logic only |
| new TypeScript tests | tests written | expected positive/negative behavior | not yet executed in this audit session |
| new .NET tests | tests written | expected Windows-side pure behavior | not yet executed in this audit session |
| new Field manuals | documentation | owner/developer/test clarity | no operational proof |

## 3. Timestamped Work Log

| Timestamp | Work | Evidence | Result |
|---|---|---|---|
| 2026-07-21T13:32:27-04:00 | audit and build pass started | branch creation and file review | branch created from canonical build branch |
| 2026-07-21T13:33:00-04:00 | reviewed Exosuit manuals and donor traceability | `AGENTS.md`, developer OS, Parts ADR, traceability | current governance understood |
| 2026-07-21T13:35:00-04:00 | reviewed Parts & Pieces audit doctrine | donor Atomic Audit and Question Everything manuals | Level 4 structure selected |
| 2026-07-21T13:40:00-04:00 | implemented TypeScript Field contracts | `src/fieldContracts.ts` | source committed to branch |
| 2026-07-21T13:45:00-04:00 | implemented Field lifecycle and demonstrations | registry and demonstration modules | source committed to branch |
| 2026-07-21T13:50:00-04:00 | implemented Windows-side foundation | `FieldFoundation.cs` | source committed to branch |
| 2026-07-21T13:55:00-04:00 | added TypeScript/.NET tests | new test files | tests written; execution pending |
| 2026-07-21T14:05:00-04:00 | added boundary, architecture, owner, developer, test manuals | new docs | manuals committed |
| 2026-07-21T14:15:00-04:00 | added Parts traceability and this audit | new QA files | committed; validation pending |

Timestamps after audit start are documentation timestamps for this continuous session, not independently measured command timestamps. Exact GitHub commit times remain the stronger evidence for individual writes.

## 4. System Inventory

### Existing Glove

- MCP gateway and action contracts,
- TypeScript orchestrator/coordinator/workflow runtime,
- .NET Windows agent,
- Windows UI Automation provider,
- optional physical motor,
- safety policy, approvals, verification, audit, emergency stop,
- application maps, persistence foundations, supervisor.

### New Field foundation

- Field contracts and attestation,
- Field lifecycle registry,
- demonstration contract and recorder,
- Windows pure identity/display/lifecycle/redaction,
- Field-specific documentation and test plan.

## 5. System Map

```text
Pilot
  -> Glove MCP/Supervisor
  -> authenticated Glove Agent inside guest
  -> Field Windows session

Host Field Manager (future)
  -> creates Field identity/policy/attestation
  -> provisions VM/storage/channel
  -> never delegates policy creation to Pilot

Owner in Teach/Shadow
  -> operates Field input
  -> consent-bound recorder observes

Pilot in Pilot Mode
  -> Glove executes within Field policy
```

## 6. Atomic Breakdown

### Unit: Field identity

**Location:** `src/fieldContracts.ts`, `apps/windows-agent/FieldFoundation.cs`  
**Plain-English purpose:** Names one exact controlled environment and prevents old observations or permissions from being used after rebuild/rollback.  
**Inputs:** Field ID, generation, agent, machine, Windows session, image/state/task disk identities.  
**Outputs:** Validated identity object.  
**State touched:** none in schema; registry stores identity.  
**Dependencies:** UUIDs, SHA-256 digest convention, session identity.  
**Failure modes:** stale generation, malformed digest, missing session, wrong subsystem.  
**Severity:** High.  
**Evidence found:** source schemas, pure tests written.  
**Evidence missing:** guest-generated identity and host/guest matching.  
**Tests needed:** branch validation, cross-language fixture, VM rollback generation test.  
**Confidence:** Medium; source is clear, runtime absent.

### Unit: Display contract

**Location:** TypeScript and .NET Field contract files.  
**Purpose:** Keeps the teaching and operating environment geometrically stable.  
**Failure modes:** changed DPI/resolution invalidates coordinates and visual behavior.  
**Severity:** High for motor similarity, Medium for semantic-only operation.  
**Evidence found:** strict single-monitor/fixed-resolution schemas and tests written.  
**Evidence missing:** actual Windows display enforcement and event detection.  
**Confidence:** Medium.

### Unit: Field policy

**Location:** `src/fieldContracts.ts`.  
**Purpose:** Authorizes one mode and bounded capabilities for one Field generation while hard-denying host/privilege expansion.  
**Failure modes:** model expands authority, stale policy reused, duplicate/ambiguous process names, consent bypass.  
**Severity:** Critical.  
**Evidence found:** Zod schema, explicit false host/privilege fields, duplicate checks, expiry, tests written.  
**Evidence missing:** integration with Windows agent safety policy and host key storage.  
**Confidence:** Medium.

### Unit: Field attestation

**Location:** `src/fieldContracts.ts`.  
**Purpose:** Binds identity, display, and exact policy with a short-lived local signature.  
**Failure modes:** canonicalization mismatch, key leakage, replay within TTL, weak key storage, incorrect clock.  
**Severity:** Critical.  
**Evidence found:** canonical JSON, HMAC-SHA256, constant-time compare, time and generation checks, tests written.  
**Evidence missing:** persisted nonce/replay control, secure key storage, host/guest channel integration, independent crypto review.  
**Confidence:** Medium-low for production; High for foundation intent.

### Unit: Field registry/lifecycle

**Location:** `src/fieldRegistry.ts`, `FieldLifecycleState`.  
**Purpose:** Keeps environment state separate from agent health and prevents unsafe direct transitions.  
**Failure modes:** stale registry, concurrent transition, lost persistence, fault cleared without reprovision.  
**Severity:** High.  
**Evidence found:** transition table, explicit fault reason, Glove binding, pure tests written.  
**Evidence missing:** durable store, concurrent process locking, recovery/hydration.  
**Confidence:** Medium.

### Unit: Demonstration episode

**Location:** `src/demonstration.ts`.  
**Purpose:** Stores consent, task goal, synchronized event metadata, outcome, and bounded event history.  
**Failure modes:** recording without consent, secret leakage, event loss, timestamp disorder, episode mixing, huge storage.  
**Severity:** Critical privacy/data integrity.  
**Evidence found:** granted-consent literal, event cap, order check, secret-key redaction, completion/abort lifecycle, tests written.  
**Evidence missing:** live consent UI, persistent encrypted storage, deletion, frame policy, keyboard credential-field suppression, hash chain.  
**Confidence:** Medium-low for operational use; High as initial schema.

### Unit: Demonstration payload redaction

**Location:** TypeScript and .NET foundation.  
**Purpose:** Removes values whose keys indicate secrets while preserving useful timing and motor metadata.  
**Failure modes:** secrets under innocuous keys, secrets in ordinary text, false positives, image leakage.  
**Severity:** Critical.  
**Evidence found:** recursive key redaction and tests written.  
**Evidence missing:** value-content scanning, UI-sensitive-field integration, frame redaction, persistence scan.  
**Confidence:** Low as complete privacy protection; Medium as defense layer.

## 7. Assumption Ledger

| Assumption | Where | Why it matters | Evidence | Risk if wrong | Verification |
|---|---|---|---|---|---|
| one monitor is acceptable for first Field | display contract | narrows geometry and test matrix | user wants mini desktop; architecture preference | later tasks may need multi-monitor | owner acceptance and task inventory |
| 1920x1080/100% is suitable | architecture | demonstrations and motor profiles depend on it | common target only | poor fit or scaling issues | local UI and DPI acceptance |
| HMAC local binding is enough for foundation | attestation | enables initial contract tests | standard primitive | insufficient key isolation/replay protection | threat review and host/guest integration tests |
| process names can scope early Field policy | policy | limits apps | existing Glove uses process allowlist | aliases/path spoofing | bind executable identity/publisher in later slice |
| key-name redaction catches common secrets | recorder | prevents obvious leakage | existing project patterns | secrets can hide in normal fields/images | sensitive-field and content scanning tests |
| event timestamp order is sufficient initially | recorder | aligns streams | source implementation | separate clocks can drift | monotonic host/guest clock design |
| browser remains ordinary desktop app | architecture | avoids browser-specific dependency | user requirement | some sites inaccessible to UIA/vision | fixture matrix and visual sensor |

## 8. Question Ledger

| Question | Why it matters | Answer found | Evidence | Unresolved? |
|---|---|---|---|---|
| Are Glove and Field distinct? | architecture and failure ownership | yes, explicit identities/lifecycles/docs | boundary doc and code | no at foundation level |
| Can the pilot create Field authority? | critical policy boundary | no in design/contracts | policy/attestation ownership docs | MCP deny tests pending |
| Is Teach consent model-owned? | privacy | no, schema requires granted consent supplied externally | demonstration schema | live UI pending |
| Does current redaction fully protect secrets? | privacy | no | audit finding | yes |
| Does attestation prevent replay? | security | expiry limits replay; nonce store absent | source inspection | yes |
| Can current code provision Hyper-V? | scope honesty | no | no manager/provisioner exists | yes, planned |
| Have tests passed? | evidence integrity | not yet in this connector session | no command output | yes until CI/local run |
| Is personal imitation implemented? | product status | no | only demonstration foundation exists | yes |

## 9. North Star Traceability Matrix

| Requirement | Implementation | Test coverage | Status | Gap |
|---|---|---|---|---|
| separate Glove and Field | boundary doc, subsystem enums, registry | TS/.NET tests written | implemented/pending validation | broader existing docs need reconciliation |
| exact Field identity | contract schemas | positive/negative tests written | implemented/pending validation | live guest identity |
| fixed teaching/operation environment | display contract | pure validation tests written | foundation | Windows enforcement |
| owner-consented demonstrations | demonstration schema | recorder tests written | foundation | live consent UI/hooks |
| bounded policy | Field policy | schema/attestation tests written | foundation | Windows policy integration |
| fresh verified operation | existing Glove architecture | existing tests | Glove foundation | Pilot Field acceptance |
| learned behavior | architecture only | test plan only | planned | all model/runtime work |
| isolation | architecture only | test plan only | planned | Hyper-V implementation/evidence |
| immediate stop | existing Glove stop | existing evidence | Glove only | per-Field and recorder stop |

## 10. Data Flow Review

Field policy and attestation flow from host authority to guest verification. Demonstration telemetry flows from the guest recorder to bounded storage and later processing. The pilot receives sanitized task state, not authority or secrets. Artifact transfer is planned but not implemented.

Critical missing controls:

- encrypted demonstration persistence,
- explicit deletion/index cleanup,
- visual-byte lifecycle,
- cross-process backpressure,
- artifact path scope,
- actor identity on derived model artifacts.

## 11. Control Flow Review

Current implemented control is pure lifecycle validation only. There is no code path enabling VM creation, recording hooks, or autonomous Field input. This reduces immediate operational risk but means product behavior is unproven.

## 12. Autonomous Testing Plan

Defined in `docs/FIELD_TEST_PLAN.md`. The immediate foundation gate is repository validator, TypeScript typecheck/tests/build/pulse, and .NET restore/build/test. Future gates progress through fake manager, guest, Hyper-V, Teach, Shadow, and Pilot evidence.

## 13. Test Execution Log

No local command execution is available through the GitHub connector used for this build pass. Tests have been written but not claimed passing.

Planned exact commands:

```text
npm install --ignore-scripts
npm run validate:repository
npm run typecheck
npm test -- --reporter=verbose
npm run build
npm run test:pulse -- --reporter=verbose
dotnet restore apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj
dotnet build apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --configuration Release -warnaserror
dotnet test apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --configuration Release --no-build
```

## 14. Failure Mode Review

Highest-priority future failures:

1. consent or recorder survives lifecycle exit,
2. host input accidentally captured,
3. stale Field generation receives actions,
4. HMAC key leaks or attestation replayed,
5. display changes while motor profile remains active,
6. event queues drop or reorder behavior silently,
7. inferred reason presented as owner fact,
8. personal model weakens safety or verification,
9. task disk/host mount escapes isolation,
10. uncertain external effect is repeated.

## 15. Security, Safety, and Risk Review

Current slice does not activate live control or recording. Main introduced risk is architectural overconfidence: future developers may mistake complete-looking contracts and manuals for operational security. All documents therefore state evidence limits and production denial.

Security gaps before live work:

- key storage and replay protection,
- host/guest mutual authentication,
- process identity stronger than name,
- input-hook privacy,
- visual privacy,
- encrypted episode storage,
- artifact path scope,
- threat model and penetration testing.

## 16. Performance and Scalability Review

The in-memory demonstration recorder caps events but does not measure byte size. A future recorder must use byte/frame/time budgets, backpressure, chunking, dropped-event reporting, and storage growth metrics. Registry and recorder are single-process foundations only.

## 17. Maintainability Review

Positive:

- separate modules,
- Zod schemas,
- parallel TypeScript/.NET vocabulary,
- explicit lifecycle table,
- direct tests,
- dedicated manuals.

Risks:

- duplicated contract logic can drift,
- no cross-language fixture yet,
- large number of manuals requires repository validation links,
- future implementation may bypass contracts if not made the sole path.

## 18. Documentation and Manual Update Review

Added:

- Glove/Field boundary,
- Field architecture,
- Field owner manual,
- Field developer manual,
- Field test plan,
- Parts traceability,
- this audit,
- engineering log planned in this slice.

Still required:

- update root README,
- update AGENTS mandatory reading,
- update repository validator and CI contract,
- add Field section to master roadmap and implemented architecture once source status is reconciled.

## 19. Missing Pieces

Critical next pieces:

1. branch validation and fixes,
2. cross-language fixture,
3. fake Field Manager,
4. durable registry and audit,
5. Hyper-V plan/dry run,
6. guest bootstrap,
7. project-specific privacy audit for recording,
8. Teach recorder,
9. scene graph/visual sensor,
10. Shadow/personal behavior pipeline,
11. Pilot policy integration,
12. artifact broker/path scope.

## 20. Improvement Plan

### Immediate

- wire new artifacts into repository validation,
- update root docs,
- run CI/local tests,
- fix exact failures,
- create draft PR.

### Next slice

- add `field-contract-v1.json`, TypeScript/.NET fixture tests, fake Field Manager, Field audit events, and deterministic provisioning plan.

### Before live recording

- new privacy-critical Level 4 audit,
- consent UI and independent stop,
- encrypted storage and deletion,
- input/visual scope tests.

## 21. Beginner Explanation

The repo now has a formal blueprint and first code for two things. The Glove is the controller. The Field is the special Windows computer it controls and learns inside. The new code gives the Field a name, version, fixed screen setup, permission document, signed proof, lifecycle, and format for recording teaching sessions. It does not create the VM or watch the user yet.

## 22. Final Audit Verdict

**Verdict: REVIEW — strong foundation source, not yet validated and not operational.**

The subsystem boundary is materially clearer and the first contracts/tests are appropriate for a foundation slice. Promotion is blocked until exact TypeScript/.NET/repository validation runs and failures are repaired. Live Field, recording, imitation, and Pilot claims remain denied.

## 23. Manual Updates Required Before Closeout

- update `README.md`,
- update `AGENTS.md`,
- update `scripts/validate-repository.mjs`,
- update `.github/workflows/ci.yml` required manual list,
- create engineering log,
- attach exact test/CI results and branch head,
- revise verdict after evidence.
