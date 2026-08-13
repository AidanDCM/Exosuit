# Level 4 Forensic Atomic Audit — Initial Exosuit Baseline

**Date:** 2026-07-17  
**Audit depth:** Level 4 — execution-sensitive architecture  
**Evidence available:** repository design and static code inspection only  
**Not yet available:** dependency install, TypeScript compile, automated test run, Windows compile, interactive desktop behavior, ChatGPT MCP connection

## 1. Audit scope

Initial Exosuit MCP gateway, deterministic safety controls, fake provider, Windows agent, UI Automation provider, audit chains, local control panel, tests, CI plan, and Codex handoff.

## 2. System inventory

- TypeScript contracts, policy, audit, agent adapters, orchestrator, MCP server, stdio entrypoint.
- .NET contracts, policy, audit, provider interface, fake provider, Windows UI Automation provider, trajectory math, loopback service/control panel.
- TypeScript and .NET unit tests plus fake full-chain pulse.
- owner/developer/security/architecture/test/reuse documentation.
- GitHub Actions workflows pending creation in this same slice.

## 3. System map

```text
MCP host -> TS schemas -> gateway guards -> loopback client
-> token middleware -> fresh observation -> local policy -> local review
-> fresh pre-execution observation -> provider -> verification
-> local + gateway audit chains
```

Emergency stop bypasses the model and proposal flow and acts locally.

## 4. Atomic breakdown

| Unit | Purpose | Primary failure | Protection | Evidence status |
|---|---|---|---|---|
| Zod contracts | reject malformed model input | schema drift | strict parse and bounds | code written; tests not run |
| TS safety | early deterministic guard | bypass/false allow | explicit deny rules | code written; tests not run |
| loop detector | stop repetition | infinite or costly loop | repeat and step thresholds | code written; tests not run |
| prompt scanner | warn on visible hostile text | incomplete pattern coverage | mutation block on finding | code written; tests not run |
| gateway ledger | trace MCP decisions | secret leak/tampering | redaction + hash chain | code written; tests not run |
| HTTP client | reach local body | remote exfiltration | loopback-only URL + token | code written; tests not run |
| fake provider | deterministic CI body | unrealistic assumptions | system pulse + explicit label | code written; tests not run |
| token middleware | local API authentication | token theft/weak token | startup length + fixed-time compare | code written; tests pending |
| local policy | final authority | gateway bypass | independent fresh evaluation | code written; tests pending |
| local review | human approval | CSRF/model-forged approval | loopback + per-process CSRF + local status | code written; manual UX pending |
| emergency stop | deterministic interruption | provider ignores cancellation | state lock + cancellation request | code written; live timing pending |
| UIA observation | internal element sensing | stale/missing tree | rebuild tree per operation | compile/local test pending |
| UIA execution | semantic control | unintended side effect | allowlist/review/verification | compile/local test pending |
| verification | prove result | false success | explicit expectation required | fake tests pending; real app pending |
| local ledger | forensic trace | deletion/corruption | hash chain, startup verification | tests pending |
| trajectory math | later fluid movement | invalid path | finite inputs/endpoints | pure tests pending |

## 5. Assumption ledger

| Assumption | Status | Validation needed |
|---|---|---|
| MCP SDK version accepts current `registerTool` annotations | inference | TypeScript build |
| OpenAI Secure MCP Tunnel can launch the stdio command in the user's workspace | supported by official docs, not account-tested | Codex/ChatGPT acceptance |
| UI Automation assemblies resolve under the selected .NET project | inference | Windows CI build |
| runtime IDs are stable long enough between observe/propose/execute | uncertain | local app tests |
| local CSRF approval flow is understandable | uncertain | owner usability test |
| provider cancellation interrupts all actions promptly | partial | local wait/action interruption tests |
| accessible names accurately communicate consequences | unsafe as sole evidence | app-specific policies and local review |

## 6. Question ledger

1. Should malformed trailing audit lines block startup or enter forensic recovery mode?
2. How should runtime-ID drift be reconciled with application maps?
3. Should local approvals be one-time, time-window, or skill-bound in the next release?
4. How will the control panel remain always visible during future raw input?
5. What external hash anchoring, if any, is appropriate?
6. Which Windows applications become the first supported scope after Notepad?
7. Can the existing AI Desktop OS provide the richer review cockpit without duplicating policy?
8. What transport/auth changes are needed if the agent ever leaves loopback? Current answer: a new security architecture, not a config flip.

## 7. North-star traceability matrix

| North-star property | Implementation |
|---|---|
| model-independent | MCP contract and provider-neutral agent interface |
| local-first | loopback .NET authority and local approvals |
| precise | semantic UIA patterns and explicit element IDs |
| safe | deny-by-default dual policy and hard denies |
| explainable | proposal decision reason/policy rule |
| interruptible | local emergency stop and provider cancellation |
| verifiable | required expectations and post-action verifier |
| auditable | two hash-chained ledgers |
| fluid later | local trajectory layer separated from MCP |

## 8. Data-flow review

### Desktop observations

Origin: provider. Transformations: element normalization, sensitive-value omission, optional prompt-injection scan. Consumers: model and policy. Storage: audit stores counts/IDs, not screenshot bytes. Risks: private names/values, stale tree, excessive context.

### Action proposal

Origin: MCP model. Transformations: schema parse, loop scan, fresh local observation, local policy. Storage: local proposal map and redacted audit. Risks: malicious text, stale targets, consequence misclassification.

### Approval

Origin: loopback panel. Transformations: CSRF and optional exact typed phrase. Storage: proposal status/audit. Risks: local malware, inattentive approval, confusing labels.

### Execution/result

Origin: provider. Transformations: verification. Storage: redacted audit. Risks: side effects before verification, false evidence, cancellation delay.

### Token

Origin: environment. Transformations: header comparison only. Storage: none intended. Risks: environment/process access, accidental logs. Redaction tests required.

## 9. Control-flow review

Positive path is proposal-first and verified. Critical control points are duplicated at gateway and local execution. The execution endpoint performs a fresh observation and policy decision, reducing stale-state risk. Pending review cannot be satisfied by MCP text.

Potential gap: a proposal marked approved remains approved until expiry even if consequence labels change but fresh policy remains review-required. This is acceptable only because the same target IDs and five-minute expiry apply; local validation should test changed element labels and consider binding approval to an observation fingerprint.

## 10. Failure-mode review

| Failure mode | Impact | Detection/protection | Severity |
|---|---|---|---|
| wrong active window | unintended app action | fresh active-window deny | Critical |
| target disappears | action drift | fresh resolution failure | High |
| credential control exposed | secret compromise | sensitive/name hard deny and value omission | Critical |
| visible prompt injection | policy manipulation | gateway warning/block; local policy remains authoritative | High |
| loop/repeat | runaway actions | repeat/step guard and stop | High |
| provider succeeds but verifier fails | uncertain state | failed result; no blind continuation | High |
| audit modified | false history | hash verification | High |
| entire audit deleted | lost evidence | not currently prevented | High |
| token leaked | unauthorized local caller | redaction, strong token, loopback; rotate | Critical |
| local malware calls panel | approval manipulation | CSRF reduces browser CSRF but not privileged malware | Critical residual |
| UIA call hangs | unresponsive agent | cancellation exists; timeout policy incomplete | High |
| control panel inaccessible | no easy approval/stop UI | process termination remains fallback | High |
| MCP disconnect | task interruption | local proposal/stop state retained | Medium |

## 11. Security, safety, and risk review

Confirmed design strengths:

- no remote full-control enable path,
- no raw input implementation,
- no screenshot implementation in Windows provider,
- loopback binding and token middleware,
- local final policy,
- exact approval status stored locally,
- password values omitted,
- audit redaction/hashing,
- explicit exclusion of credential theft, unauthorized access, privilege escalation, and covert recording.

Unconfirmed until tests:

- middleware covers every `/v1` route,
- JSON enum wire compatibility,
- audit chain implementation is deterministic across reload,
- UIA compile/runtime behavior,
- emergency cancellation latency,
- control-panel CSRF and browser behavior.

## 12. Performance and scalability review

The Windows provider currently traverses the desktop or selected window fresh for each operation. This is safer than stale caches but may be slow on large accessibility trees. `MaxElements` bounds output, not necessarily search traversal. Later optimization should use cached window roots and property conditions while preserving freshness checks.

The in-memory proposal map and ledger tail are suitable for one-user MVP. Retention and compaction are not designed.

## 13. Maintainability review

Strengths:

- small provider interface,
- shared conceptual contracts,
- fake end-to-end path,
- narrow MCP tools,
- repo-native manuals and logs.

Risks:

- TypeScript/C# contract duplication,
- policy duplication may drift,
- large `Program.cs`,
- string-based verification kinds,
- app-specific behavior will need adapters rather than policy regex growth.

Required improvement: add cross-language JSON fixtures and split Windows service handlers after first green build.

## 14. Missing pieces

- actual CI results,
- CodeQL workflow/results,
- cross-language fixture tests,
- timeout middleware/provider deadlines,
- Windows interactive test harness,
- richer control indicator/tray application,
- screenshot privacy implementation,
- application map persistence,
- skill manifests,
- remote hash anchoring,
- packaging/installer,
- OpenAI tunnel/account configuration,
- Claude MCP validation.

## 15. Improvement plan

1. Commit and run CI.
2. Fix every compile/test issue; update this report with run IDs.
3. Add contract fixtures generated by TS and consumed by C#, and vice versa.
4. Add agent endpoint integration tests using an in-process test server.
5. Add explicit action timeouts.
6. Complete Codex observe-only validation.
7. Test one semantic action in a disposable VM.
8. Harden approval binding to a fresh observation fingerprint.
9. Add tray/always-visible stop UI before motor work.
10. Feed reusable fixes back into Parts & Pieces.

## 16. Beginner explanation

ChatGPT can ask Exosuit to do something, but it cannot simply take over. The request is checked twice, the real computer checks again immediately before acting, risky work waits for a person at the computer, the result is checked, and a local stop button can shut the system down. For now, GitHub can prove the logic and fake computer work; it cannot prove the real mouse, windows, or ChatGPT connection until the next local phase.

## 17. Final audit verdict

**Verdict: REVIEW — architecture is appropriately defensive for an initial build, but no implementation claim is yet test-proven.**

The system is ready to enter CI validation after the remaining repository files and workflows are committed. Real Windows mutation and ChatGPT control remain explicitly unapproved until local acceptance evidence exists.
