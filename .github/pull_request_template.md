# Exosuit Pull Request Checklist

## North Star and scope

- [ ] The change has one clear, testable goal.
- [ ] Acceptance criteria map directly to that goal.
- [ ] The slice is independently reviewable, disableable, and reversible.
- [ ] Unresolved assumptions are recorded rather than silently guessed.

## Mandatory reading

- [ ] I read `AGENTS.md`.
- [ ] I read `DEVELOPER_OPERATING_SYSTEM.md`.
- [ ] I read `OWNER_MANUAL.md`.
- [ ] I read `docs/SECURITY_MODEL.md` and `docs/TEST_PLAN.md`.
- [ ] I read the latest `docs/qa/` audit.
- [ ] I applied the Parts & Pieces Atomic Audit, North Star, question-everything, strict/fluid execution, and evidence disciplines at the appropriate depth.

## Reuse and donor review

- [ ] I checked `docs/PARTS_REUSE_ADR.md` and `docs/qa/PARTS_AND_DONOR_TRACEABILITY.md` before building new infrastructure.
- [ ] I inspected relevant tested Parts & Pieces implementations before adapting them.
- [ ] I treated blueprint-only parts as specifications, not as tested code.
- [ ] Reused behavior is isolated behind an Exosuit interface and covered by Exosuit tests.
- [ ] I did not copy donor weaknesses merely to preserve similarity.

## Safety invariants

- [ ] The model still proposes; the local agent remains final authority.
- [ ] Unknown actions, targets, processes, and verification states fail closed.
- [ ] State-changing work passes through proposal, policy, approval where required, fresh observation, execution, and verification.
- [ ] Emergency stop remains local and independent of ChatGPT, MCP, and the active action.
- [ ] No MCP or web-panel path enables full control.
- [ ] No credential scraping, unauthorized account access, privilege escalation, or covert recording behavior was introduced.
- [ ] Tokens, passwords, cookies, private keys, screenshot bytes, and private fixtures are not committed or logged.

## Testing and evidence

- [ ] Positive, deny, failure, and recovery cases were tested.
- [ ] TypeScript contracts and policy tests pass where applicable.
- [ ] .NET policy/provider pure tests pass where applicable.
- [ ] The fake-provider system pulse passes for control-flow changes.
- [ ] Cross-language contract fixtures were updated when the wire contract changed.
- [ ] Commands actually run, exit codes, CI run IDs, and artifacts are recorded.
- [ ] Evidence levels are stated honestly: static, unit, fake integration, hosted Windows, local Windows, or ChatGPT MCP.
- [ ] No live behavior is claimed from compile-only or mock-only evidence.

## Audit and operations

- [ ] The Atomic Audit depth is stated and justified.
- [ ] `docs/qa/ATOMIC_AUDIT_BASELINE.md` or a newer audit was updated for execution-sensitive changes.
- [ ] A per-entry file under `docs/engineering_log/` records the change.
- [ ] Relevant decision, issue/solution, and internal changelog entries were updated.
- [ ] Operational changes include risk, monitoring, and rollback notes.
- [ ] Local/Codex checks that remain are explicit.

## Required summary

### Goal and acceptance criteria


### What changed


### Parts & Pieces and donor systems considered


### Atomic Audit depth and findings


### Tests and evidence


### Safety impact


### Risks and rollback


### Remaining local validation


### Next recommended slice

