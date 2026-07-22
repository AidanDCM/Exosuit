# Exosuit Glove and Shared-System Test Plan

**Authority:** `docs/MASTER_SYSTEM_ROADMAP.md`  
**Applies to:** Exosuit Glove and the authenticated Glove–Field integration  
**Field-specific companion:** `docs/FIELD_TEST_PLAN.md`

## 1. Purpose

This document defines how Glove and combined-system claims are tested. A feature is not complete because it compiles, because a fake provider passes, or because a donor project contained a similar test.

Every result must state:

- exact branch and commit;
- subsystem: Glove, Field, or shared boundary;
- environment and versions;
- command or procedure;
- expected and actual result;
- evidence artifact;
- evidence level;
- residual risk;
- rollback or disable path.

## 2. Evidence levels

| Level | Meaning |
|---|---|
| E0 | source/static review only |
| E1 | deterministic unit tests |
| E2 | fake-provider or simulated full-chain integration |
| E3 | hosted build/test on the target operating system |
| E4 | isolated interactive Windows acceptance |
| E5 | real multi-window workflow acceptance |
| E6 | authenticated Glove–Field host/guest acceptance |
| E7 | normal ChatGPT MCP acceptance |
| E8 | low-risk owner acceptance |
| E9 | production-candidate packaging, security, privacy, performance, and operations |

Lower evidence never implies a higher level.

## 3. Current claim boundary

### Glove single-action core

Source and earlier evidence cover:

- MCP contracts and protocol tests;
- fake desktop and full-chain fake pulse;
- Windows UI Automation provider;
- bounded semantic actions and verification;
- pointer movement, left click, Unicode typing, and bounded hotkeys;
- deterministic policy, local approval, audit, deadlines, and emergency stop;
- bounded earlier Windows Sandbox acceptance.

The current combined branch still requires exact-head execution.

### Glove coordinator and advanced foundations

Source/fake foundations exist for:

- multi-window workflows;
- focus and window leases;
- artifacts and checkpoints;
- uncertain-effect recovery;
- virtual desktops;
- supervisor/agent registration;
- visual policy;
- browser companion foundation;
- signed skill manifests;
- resource governance.

These do not have complete interactive production evidence.

### Field

Field evidence is controlled by `docs/FIELD_TEST_PLAN.md` and the L0–L20 phases in the master plan.

## 4. Mandatory automated validation

### TypeScript

```bash
npm run validate:repository
npm run validate:plan
npm run validate:field-contract
npm run typecheck
npm run test:field -- --reporter=verbose
npm run test:field-pulse -- --reporter=verbose
npm test -- --reporter=verbose
npm run build
npm run test:pulse -- --reporter=verbose
```

### .NET

```powershell
dotnet restore apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj
dotnet build apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --configuration Release --no-restore -warnaserror
dotnet test apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --configuration Release --no-build
```

### Windows evidence runner

```powershell
./scripts/windows/Invoke-ExosuitFieldValidation.ps1
```

The runner must preserve the exact commit, tool versions, per-step logs, and summary JSON.

## 5. Glove contract and policy matrix

Positive tests:

- bounded observe request;
- bounded semantic action with target and expected result;
- locally approved physical proposal;
- fresh target and window generation;
- successful verification;
- audit append and independent chain verification;
- local emergency stop.

Negative tests:

- malformed action;
- missing expected result;
- mutation in observe mode;
- wrong process/window/generation;
- credential or sensitive target;
- unsupported physical primitive;
- raw input without local full-control startup;
- proposal changed after approval;
- expired approval;
- prompt-injection text treated as authority;
- repeated action or loop budget exhaustion;
- provider timeout;
- mutation after emergency stop.

## 6. Windows-agent matrix

### Startup and authentication

- loopback-only listener;
- strong token required;
- missing/wrong token denied;
- Windows provider acknowledgement required;
- physical input disabled unless every startup gate passes;
- control panel and MCP cannot enable physical input;
- CSRF and local control-panel protections.

### UI Automation

- enumerate top-level windows;
- active window matches foreground state;
- safe names, roles, states, actions, and bounds;
- sensitive values omitted;
- runtime caps enforced;
- disappeared or stale targets fail cleanly;
- focus, invoke, value, selection, scroll, wait, and verification;
- unsupported/custom surfaces report uncertainty rather than success.

### Motor

Current primitives:

- pointer move;
- left click;
- Unicode typing;
- bounded hotkeys;
- cancellation.

Required production expansion tests:

- right, middle, and double click;
- mouse down/up;
- drag;
- vertical and horizontal wheel;
- key down/up;
- named key press;
- focus theft during every primitive;
- target movement during every primitive;
- emergency-stop latency during every primitive;
- no input outside active allowlisted window;
- host cursor unaffected when operating a Field guest.

### Display/session matrix

- 100%, 125%, and 150% scaling;
- primary and secondary monitor where supported;
- minimized/restored windows;
- lock/unlock;
- Secure Desktop;
- standard/elevated target boundaries;
- RDP and VM session changes;
- screen resolution changes fail closed where fixed display is required.

## 7. Application-map tests

- exclude live values, raw runtime IDs, screenshots, plain titles, and sensitive controls;
- store process, role, automation ID, safe actions, relative geometry, fingerprint, and revision;
- reopen and rematch current runtime IDs;
- missing controls remain unmatched;
- changed identity emits warning;
- application maps never create permission;
- execution always begins with fresh observation.

## 8. Multi-window coordinator tests

### Fake and deterministic

- three or more windows in one workspace;
- monotonic workspace and window generations;
- DAG validation and cycle rejection;
- A → B → C structured artifact transfer;
- provenance and integrity hashes;
- parallel read-only observations;
- serialized physical work per session;
- shared-read and exclusive-write conflicts;
- focus-lease acquisition, expiry, cancellation, and emergency invalidation;
- deterministic lock ordering;
- close/reopen generation change;
- modal interruption;
- failed verification blocks dependents;
- checkpoint save and hydrate;
- crash before, during, and after action;
- uncertain external effect reconciles before retry;
- no duplicate simulated effect;
- pause, resume, cancel, and emergency propagation;
- audit reconstructs full workflow.

### Interactive Windows

- Notepad, Calculator, and the synthetic Field fixture;
- repeated focus switching;
- owner steals focus mid-action;
- target minimizes/restores;
- target closes/reopens;
- modal appears between steps;
- structured transfer without clipboard;
- measured scheduler, focus, action, verification, and recovery latency.

Promotion requires both deterministic and interactive evidence on compatible contracts.

## 9. Virtual desktop tests

If retained:

- real desktop identity, not title inference;
- inactive desktop blocks execution;
- workflow pauses with explicit reason;
- switching requires local approval by default;
- switch invalidates focus authority;
- target moves between desktops;
- desktop disappears or ID changes;
- resume begins with fresh observation;
- emergency stop during switching.

## 10. Multi-agent and session tests

- authenticated registration;
- capability and contract negotiation;
- heartbeat and stale-agent state;
- two independent session branches;
- one disconnects mid-step;
- artifact integrity across agents;
- per-agent and global stop;
- unreachable-agent reporting;
- restart and state hydration;
- key rotation and replay protection;
- VM suspend/resume and snapshot rollback;
- the host never operates guest internals through VM viewer pixels.

## 11. Browser rule and tests

The browser is an ordinary Windows application. Production acceptance does not depend on Playwright, a DOM bridge, an extension, or a special AI browser.

Required tests:

- browser launch through desktop controls;
- address/search field grounding through UI Automation or vision;
- tabs/windows treated as visible application state;
- navigation and reload invalidate stale state;
- loading, popup, download, and changed-layout handling;
- password and credential fields denied or delegated to credential broker;
- hostile page content remains untrusted;
- independent verification of navigation and task result.

Any optional semantic browser companion remains disabled until separately reviewed and may never replace fresh desktop verification.

## 12. Visual observation tests

Visual observation remains blocked until its privacy phase passes.

Required evidence:

- disabled by default;
- explicit task consent;
- persistent capture indicator;
- independent local stop;
- window/region scope;
- sensitive-region redaction before persistence;
- protected/blank surface behavior;
- frame, byte, time, and queue budgets;
- no raw image bytes in normal audit or application maps;
- encrypted external blobs where retained;
- expiration and deletion certificate;
- uncertain grounding stops execution.

## 13. Glove–Field integration tests

- exact Field ID and generation binding;
- exact Glove agent/session binding;
- signed policy and attestation;
- authenticated direction/sequence/nonce/key/payload/expiry checks;
- persistent replay state across restart;
- heartbeat degradation and fault;
- lock and Secure Desktop block input;
- Teach and Shadow have no input authority;
- Pilot requires current scene, exact policy, action ordinal, budget, route, and capability;
- emergency stop remains independent of model and normal channel;
- generation replacement rejects stale messages and commands.

## 14. ChatGPT MCP acceptance

- reviewed narrow tool allowlist only;
- no Field administration, consent, key rotation, deletion, sensitive export, or raw Hyper-V commands;
- status and observation work in a normal conversation;
- proposals use current state;
- local policy and approval remain authoritative;
- success is reported only after verification;
- cancellation and emergency stop work without relying on the conversation;
- complete sanitized audit references the request.

## 15. Reliability and recovery

- provider timeout before effect;
- timeout during possible effect;
- crash before action;
- crash during action;
- crash after effect before checkpoint;
- duplicate message or delivery;
- stale checkpoint;
- corrupted checkpoint or audit;
- storage full;
- migration forward and rollback;
- no blind retry after possible external effect;
- dead-letter/frozen state is visible;
- support bundle excludes private content.

## 16. Performance and resource tests

Establish measured targets for:

- observation latency;
- scene update latency;
- action proposal latency;
- focus-switch latency;
- motor start and completion latency;
- verification latency;
- emergency-stop latency;
- workflow scheduler overhead;
- idle and active CPU;
- memory by windows, workflows, agents, scene size, and replay state;
- audit and demonstration storage growth;
- backpressure and overload degradation.

Report p50, p95, p99, maximum, sample count, environment, and regression threshold.

## 17. Supply-chain and packaging tests

- committed reviewed lockfiles;
- `npm ci --ignore-scripts`;
- npm and NuGet vulnerability audits;
- SBOM;
- reproducible build manifest;
- signed binaries and installer;
- clean install, upgrade, downgrade where supported, rollback, uninstall, and data removal;
- configuration and storage migration;
- update blocked during active workflow;
- signature and integrity failure behavior.

## 18. Security, privacy, and abuse tests

- threat-model review;
- prompt-injection and hostile-content fixtures;
- authority escalation attempts;
- credential harvesting denial;
- host path and reparse attacks;
- message tampering/replay;
- consent bypass;
- covert-recording prevention;
- policy substitution;
- stale generation;
- stop-path sabotage;
- support-bundle privacy;
- penetration test of local interfaces;
- incident-response and key-revocation drill.

## 19. Production release gate

Production is denied until all of the following are true on one signed release candidate:

- current-head automated suites pass;
- required interactive Glove and Field matrices pass;
- normal ChatGPT acceptance passes;
- no unresolved critical/high security finding;
- privacy and deletion evidence passes;
- performance targets pass;
- installer, signing, update, rollback, and uninstall pass;
- operational manuals and incident response are approved;
- owner signs the production readiness decision.

## 20. Current verdict

See `docs/qa/PRODUCTION_READINESS_ASSESSMENT_2026-07-22.md`.

Current production status: **DENIED**.