# Decision Log

## 2026-07-17 — Separate Exosuit body from the cockpit

**Decision:** Build Exosuit as a focused model-independent body/MCP bridge. Keep `AI-Desktop-Operating-System-` as a compatible cockpit and donor.

**Reason:** The body needs independent security review, deployment, testing, and use by normal ChatGPT without requiring the complete IDE/control room.

## 2026-07-17 — Tool-only private ChatGPT app first

**Decision:** Ship narrow MCP tools before any widget UI.

**Reason:** The user wants the normal ChatGPT conversation to be the brain. The first UI that matters is local approval and stopping, which belongs on the controlled machine.

## 2026-07-17 — Dual deterministic policy

**Decision:** Enforce safety in both the TypeScript gateway and .NET agent, with the .NET agent as final authority.

**Reason:** A gateway mistake or alternate client must not expose the machine.

## 2026-07-17 — Fake provider before Windows provider

**Decision:** Use the fake provider for the full CI chain and make the Windows provider opt-in.

**Reason:** This follows Parts & Pieces desktop-harness guidance and separates software correctness from interactive OS behavior.

## 2026-07-17 — Semantic UI Automation before raw input

**Decision:** Implement UI Automation observation and semantic patterns first. Include trajectory math only; do not inject mouse or keyboard input.

**Reason:** Semantic actions are more stable and verifiable. Broad raw input is critical risk and requires a later local audit.

**Status:** Superseded by the later restart-gated standard-Windows motor decision below. The ordering principle remains active: semantic operation is preferred over physical input.

## 2026-07-17 — Proposal and execution are separate tools

**Decision:** ChatGPT must propose an action, receive the local decision, and then execute the proposal separately.

**Reason:** This creates a clear approval boundary and prevents a single tool call from combining intent, permission, and irreversible execution.

## 2026-07-17 — Full control is local-only and unavailable in MVP

**Decision:** Neither MCP nor the local web panel can enable full control.

**Reason:** A remote/model-facing switch would undermine the central trust boundary.

**Status:** Partially superseded. Full-control implementation now exists, but the central restriction remains: it can only be activated by an exact local restart configuration and cannot be enabled through MCP or the panel.

## 2026-07-17 — Hash-chain both audit layers

**Decision:** Maintain separate redacted hash chains in the gateway and agent.

**Reason:** The system needs evidence of both model-facing decisions and local execution, and neither layer should silently rewrite history.

## 2026-07-17 — Standard Windows motor is transparent and restart-gated

**Decision:** Implement bounded pointer movement, left click, Unicode typing, and a small hotkey allowlist through documented Windows APIs. Activate the motor only when the process starts with the Windows provider, both exact risk acknowledgements, physical input enabled, `full_control`, and a non-empty process allowlist.

**Reason:** The user requires a complete computer body, but physical input is a critical-risk fallback. Restart-only composition, active-window/process/coordinate/focus checks, typed local approval, verification, deadlines, audit, and emergency stop preserve the local trust boundary.

## 2026-07-17 — One authoritative execution tool

**Decision:** Keep separate semantic and physical proposal tools if useful for clarity, but route all returned proposals through one authoritative execution tool and one local policy path.

**Reason:** Multiple execution paths create opportunities for inconsistent approval, verification, or audit behavior.

## 2026-07-17 — Master System Roadmap is the planning authority

**Decision:** `docs/MASTER_SYSTEM_ROADMAP.md` controls future feature order, dependencies, evidence levels, and promotion gates. `docs/ARCHITECTURE.md` describes only implemented architecture; `docs/CODEX_HANDOFF.md` covers only the immediate local acceptance phase.

**Reason:** Future-work lists had become distributed across architecture, audit, README, and handoff documents. One authoritative roadmap prevents contradictory claims and makes multi-window, virtual-desktop, multi-agent, browser, visual, skills, packaging, and production work traceable.

## 2026-07-17 — Multi-window reasoning is parallel; physical execution is serialized per session

**Decision:** The future coordinator may observe and plan across many windows concurrently, but foreground focus and physical input use one exclusive lease per interactive Windows session. Genuine physical parallelism requires separate agents or Windows sessions.

**Reason:** One interactive session has one foreground focus and one physical input stream. Pretending otherwise would produce race conditions and unreliable execution.

## 2026-07-17 — One agent runs inside each controlled VM or remote session

**Decision:** Multi-VM and remote-session support will use a supervisor coordinating an Exosuit agent inside every controlled Windows session. The host must not treat a VM display window as semantic access to the guest desktop.

**Reason:** UI Automation, focus, input, and approval are session-bound. Per-session agents preserve correct identity, policy, interruption, and audit boundaries.

## 2026-07-27 — Execution invariant is one path, not one tool name

**Decision:** Restate the 2026-07-17 "One authoritative execution tool" decision as **one authoritative execution path**. The invariant is that every returned proposal reaches one orchestrator method, one agent execute endpoint, and one local policy path. The number of MCP tool names that can reach that path is a surface-documentation question, not a safety invariant.

**Reason:** The desktop core has two execution tool names, `desktop_execute_proposal` and `desktop_execute_physical_proposal`. Both call `ExosuitOrchestrator.executeProposal`, so the invariant held, but the "one tool" phrasing propagated into `README.md`, `docs/ARCHITECTURE.md`, `docs/SECURE_MCP_TUNNEL_RUNBOOK.md`, and `docs/qa/GITHUB_PHASE_FINAL_AUDIT.md` as lists that omitted `desktop_execute_physical_proposal` entirely.

**Second finding, same slice:** the drift was worse than a single missing name. `src/server.ts` registers the coordinator surface unconditionally in `composeServer`, so the live tool count is twenty-seven, while `docs/SECURE_MCP_TUNNEL_RUNBOOK.md` still published a thirteen-name allowlist. `docs/CODEX_HANDOFF.md` Phase 10 instructs the validator to confirm that only reviewed tools are discovered, and treats an unexpected discovered tool as a stop condition. A Phase 1 run against that runbook would have found fourteen undocumented coordinator tools.

**Rule going forward:** Any change to the registered tool list must update `tests/documentedToolSurface.test.ts` expectations, the runbook allowlist, and the README surface list in the same slice. The registered surface is the authority; documents follow it, and the test enforces the agreement in both directions.

**Open question for the owner:** whether Phase 1 acceptance should present the desktop core alone. If so, the coordinator registration needs an explicit composition flag in `src/server.ts`; it cannot be achieved by scoping a document.

## 2026-07-27 — Hosted CI is blocked by account billing; keep the runner smoke test

**Decision:** Record GitHub account billing as the identified cause of the hosted-CI blockage, stop attempting to fix it by editing workflow YAML, and retain `.github/workflows/runner-smoke.yml` permanently as the diagnostic control.

**Reason:** Every job in every workflow fails with GitHub's annotation that the job was not started because account payments failed or the spending limit needs raising. The smoke test isolates this conclusively: its jobs contain one `echo` step with no checkout, dependencies, cache, or job dependencies, and both the Linux and Windows jobs fail identically. A workflow that only requests a runner cannot fail for a configuration reason.

Four earlier commits changed the project-surface detection gate, job independence, and npm cache settings while chasing this blockage. None could have worked, because none of those things were the cause. The repository recorded the symptom honestly but never named the cause, so the wrong diagnosis was re-derived repeatedly.

**Consequences:** Resolution requires the account owner to act in GitHub Billing & plans and is not reachable from this repository. Until then, hosted CI is unavailable, no hosted evidence may be claimed, and `npm run validate:typescript` is the substitute gate. Two defects reached the canonical branch during the outage — a build-breaking `as const` and a prompt-injection guard gap — which is the concrete cost of running without the gate.

**Rule going forward:** Before changing workflow files to fix a hosted-run failure, dispatch `runner-smoke.yml` first. If it fails, the problem is account-level and no workflow edit will help.

## 2026-07-27 — The MCP surface is core by default; the coordinator is opt-in

**Decision:** Add `EXOSUIT_MCP_SURFACE` to `src/server.ts` with values `core` and `full`. `core` is the default and exposes the thirteen desktop-core tools. `full` additionally exposes the fourteen coordinator tools. An unrecognized value throws at startup rather than falling back to either mode.

**Reason:** `composeServer` previously registered `registerCoordinatorMcpTools` unconditionally, so every connected pilot discovered all twenty-seven tools with no way to narrow them. That conflicted with `docs/CODEX_HANDOFF.md`, which requires Phase 9 to confirm the discovered list matches the reviewed core surface and Phase 10 to confirm only reviewed tools are discovered, and which treats an unexpected discovered tool as a stop condition.

The coordinator is `in_progress` in the master roadmap with no hosted CI evidence and no interactive multi-window evidence. Exposing fourteen unvalidated tools to a pilot by default contradicted deny-by-default and the safety-asymmetry rule that expanding autonomy is never the safe direction.

**Why `core` is the default rather than `full`:** the safe state must be the one reached by omission. An operator who forgets the variable gets the reviewed, narrower surface; widening requires a deliberate act. The reverse default would have preserved the exposure it was meant to fix.

**Scope limit:** this controls **exposure only**. It is not a security boundary for the coordinator's behavior. Workflow and agent state still hydrate under `core`, and every coordinator policy, approval, and verification requirement is unchanged in both modes. Hiding a tool must never be treated as a substitute for its safety controls.

**Consequences:** Phase 1 acceptance now runs against thirteen tools, and the runbook allowlist, `docs/CODEX_HANDOFF.md`, `README.md`, and `docs/ARCHITECTURE.md` all state that. Coordinator acceptance belongs to Phase 2 and needs `EXOSUIT_MCP_SURFACE=full` plus its own promotion gate. `tests/mcpProtocol.test.ts` opts into `full` explicitly because it asserts the complete surface.

## 2026-08-02 — Install a narrow Field owner lifecycle service, not a privileged shell

**Decision:** Accelerate development with a separate LocalSystem service whose owner-
installed standing policy permits only exact-generation Field provisioning,
authenticated read-only observation, and destruction through fixed, hash-bound scripts and observer. The service has no MCP or network
surface and cannot accept an executable, script, argument list, policy mutation,
consent, recording, key, export, mode, or full-control operation.

**Reason:** Repeated UAC launches and manual lifecycle handoffs dominate live evidence
time, while the full local source suite takes only minutes. A bounded service preserves
the existing `field_service` authority distinction and lets one reviewed installation
replace repeated elevation without giving the pilot administrative authority.

**Consequences:** Installation/policy replacement remains an elevated owner action;
jobs are fresh, exact-generation, capacity-bound proposals to the service. Installed
inputs are verified before every job. Static/unit or successful installation evidence
does not promote L1-L3; live lifecycle, tamper, cancellation, immutability, destruction,
and rollback evidence remains mandatory. Uninstall preserves sanitized evidence.

## 2026-08-08 — Derive component-only bases offline from an accepted immutable source

**Decision:** For guest-agent/script-only updates, create a new base version by copying
the last accepted generalized read-only image and mounting only the copy offline. The
source is never writable, existing targets are never overwritten, permitted paths are
fixed, per-generation configuration is denied, and publication requires digest and
read-only verification.

**Reason:** Re-running the Audit Mode account-cleanup and Sysprep ceremony for unchanged
Windows/application state adds time and fresh credential handling without strengthening
a component-only update. Offline copy derivation narrows the mutation surface and makes
the unchanged source independently rehashable.

**Consequences:** A derived image does not inherit acceptance. It needs a unique image
ID/digest, explicit host-registry entry, disposable guest acceptance, lifecycle/base
immutability evidence, and rollback. Any Windows feature, account, application, service
registration, or machine-state change still requires the full maintenance/Sysprep path.

## 2026-08-10 â€” Stop evidence belongs to the phase that owns the stopped capability

**Decision:** CHN-001 version 2 proves exact-Field host stop only with a healthy and a
degraded authenticated channel. Stop during live execution is ACT-001.23. Stop during
explicitly consented, visibly active recording is TCH-001.12. The historical
CHN-001.12 identifier is retired and cannot be reused.

**Reason:** The v1 CHN contract required active execution and recording evidence in M1,
but the authoritative roadmap does not introduce live scenes/execution until later and
denies live recording until L5/M3. The requirement was therefore impossible to satisfy
honestly without fabricating capability or skipping phase dependencies.

**Consequences:** No final safety requirement is removed. Execution and recording stops
remain mandatory before MVP and production, now after their authorities exist. A narrow,
content-addressed migration may reevaluate an existing v1 CHN session only when its
evidence commit is an ancestor and every intervening changed file is on the reviewed
contract/docs/tests allowlist. Runtime, provider, policy, key, transport, and Field script
changes force a new live run. Rollback is to restore the v1 contract and abandon migrated
candidates; it is not permission to invent CHN-001.12 evidence.

## 2026-08-10 — Service-session evidence is not interactive-session evidence

**Decision:** Keep the LocalSystem guest service/session identity and the controlled
interactive Glove session identity separate. Historical v1 M1 manifests with
`windowsSessionId=0` remain valid for service/bootstrap evidence only. M2 scene evidence
must bind a per-boot active interactive session, interactive user SID, client PID, fixed
agent path, and executable digest derived from Windows by the relay adapter.

**Reason:** The existing bootstrap script runs under LocalSystem and compares its own
session ID to the manifest, so the value `0` cannot prove which desktop UI Automation
observed. Treating it as interactive identity would violate the one-agent-per-controlled-
session law and could authorize a scene produced from the service desktop.

**Consequences:** Prior HYP/CHN evidence is not invalidated or expanded. It cannot promote
SCN-001. The relay signing boundary accepts separate interactive client facts and refuses
session zero; the source resolver now derives facts from a connected Windows pipe/process,
but live promotion additionally requires secured one-way IPC, exact-binary race testing,
a session-local launcher, and KVP scene acquisition. A
future contract revision should replace the overloaded v1 name with explicit
`fieldServiceSessionId`, `activeInteractiveSessionId`, and `interactiveUserSid` fields.

## 2026-08-10 — Cryptographic role separation is not operator separation

**Decision:** Classify the CHN-001 promotion as approval-independence **class B**:
cryptographically separate approval key, same-machine and same-operator custody. Accept
class B as a personal-MVP weakness. CHN-001 is **not** reopened, revoked, or re-run, and
the two hardening items below are not retroactive.

**Reason:** The frozen v2.3 contract genuinely enforces role separation. A promotion into
`passed` requires a reviewer principal distinct from the issuer, a `reviewerKeyId` distinct
from the sealing `signingKeyId`, the exact `reviewerRole` the gate demands, and a valid
Ed25519 reviewer signature resolved through the key registry with role, revocation,
validity-window, and machine-binding checks. The registry is single-role per key, so the
ledger key cannot mint a review. CHN-001 satisfied all of it: reviewer
`root:chn001_independent_review`, role `technical_review`, key `live-technical-review-1`,
sealed by `live-ledger-1`. That is the frozen contract that existed at promotion time, and
it was met.

What the contract does **not** establish is custody or human independence. All eight live
keys sit in one directory under one Windows account, and the promotion CLI selects the
approval private key by role when `--reviewer-key` is omitted, so one unattended
invocation on one host can produce both signatures. Software on a single account cannot
manufacture genuine human separation, and the record should not imply that it did.

**Consequences:** M2 proceeds. Two narrowly scoped hardening items are tracked separately
and neither invalidates existing evidence:

- *Evidence-issuer separation.* Nothing currently compares a cited evidence record's
  authorship to the approving principal. The rule must bind **keys**, not display strings:
  the `reviewerKeyId` may not equal the `signingKeyId` of any cited evidence record. Issuer
  names are operator-chosen free text, so a name comparison would be cosmetic. This is
  verifier logic only and does not move the frozen fingerprint; it also already holds for
  every event in the current ledger, so adding it revokes nothing.
- *Reviewer-key custody.* Custody binding, protection backend, and TPM participation are
  recorded for the sealing key alone; `reviewerKeyId` flows into no custody check and
  `live-technical-review-1` has no custody events. Closing this adds fields to the ledger
  event schema, which **does** move the frozen fingerprint and is therefore a deliberate
  contract revision requiring a label bump and re-attestation — not a casual edit.

For production and owner-acceptance gates, class B is not sufficient: the approval key
must move to a separate trust boundary — another device, account, or token, or an
interactive approval the automation cannot invoke itself.
