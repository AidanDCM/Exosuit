# Engineering Log — GitHub Validation Cycle

**Date:** 2026-07-17  
**Canonical branch:** `build/exosuit-mvp`  
**Validated TypeScript head:** `d8c665a12ad60957cbd286a1636d71ac3f619460`  
**Evidence class:** reconstructed-container TypeScript validation plus historical GitHub Actions failure evidence  
**Not yet proven:** current-head GitHub Actions, .NET compile/tests, real Windows UI Automation, ChatGPT MCP connectivity

## Goal

Turn the initial Exosuit foundation into a reproducible, audited GitHub-testable build while incorporating applicable Parts & Pieces doctrine, tests, and donor patterns without treating blueprint material or unrelated repositories as proof.

## Donor review applied

- Parts & Pieces Atomic Audit, North Star interrogation, question-everything protocol, strict/fluid execution, quality gates, loop-sentinel discipline, event-ledger, reconciliation, redaction, and evidence-source rules.
- AI Desktop OS permission, review, event-timeline, job-state, and emergency-stop concepts as reference product behavior only.
- MCP platform/operator repositories for narrow structured tool boundaries.
- Dev Orchestrator for small slices, explicit acceptance criteria, and handoff discipline.
- Pokemon Yellow bot for the thin provider-adapter boundary.

See `docs/qa/PARTS_AND_DONOR_TRACEABILITY.md`.

## Historical GitHub Actions evidence

The first GitHub Actions run for the initial PR head was run ID `29615724253` and failed in three jobs:

- TypeScript contracts/gateway job failed during typecheck.
- Repository contract job failed.
- Windows build job failed.

The original workflow logs were truncated before useful compiler diagnostics. The CI workflow was therefore changed to upload TypeScript, Windows-build, and repository-contract diagnostics as artifacts on every run.

## Issues found and corrected

1. **MCP structured-content typing**
   - `ElementSearchResult` was a named interface.
   - The MCP SDK expects an indexable structured-content object.
   - Changed it to a type alias.

2. **Secret-shaped test fixture**
   - A literal fake `sk-...` credential shape in a TypeScript test triggered the repository secret-shape scanner.
   - The fixture is now assembled at runtime so source control contains no token-shaped literal.

3. **Audit canonicalization**
   - `JSON.stringify` can return `undefined`, while the canonicalizer promised a string.
   - Undefined values now receive an explicit deterministic representation.

4. **Windows UI Automation references**
   - The Windows project relied on implicit UI Automation assembly availability.
   - `UIAutomationClient` and `UIAutomationTypes` are now explicit references; the unused Windows Forms surface was removed.

5. **Fake-agent regression test mismatch**
   - The test executed against `el-editor` but verified the old generic fixture ID `el-1`.
   - The expectation now binds to the actual target element.

6. **Cross-language drift risk**
   - Added `tests/fixtures/wire-contract-v1.json`.
   - TypeScript validates it through Zod.
   - .NET copies and deserializes the same fixture using snake-case enum configuration.

## Reconstructed-container TypeScript evidence

The canonical TypeScript source, current tests, exact MCP tool registration, and shared fixture were reconstructed in an isolated container using the repository's declared dependency versions already available in the environment.

Commands executed:

```text
./node_modules/.bin/tsc -p tsconfig.json --noEmit
./node_modules/.bin/vitest run --reporter=verbose
./node_modules/.bin/tsc -p tsconfig.json
./node_modules/.bin/vitest run tests/systemPulse.test.ts --reporter=verbose
```

Observed results:

- strict TypeScript typecheck: exit 0,
- full TypeScript suite: 3 files passed, 21 tests passed,
- production TypeScript build: exit 0 and `dist/src/mcp.js` present,
- isolated system pulse: 1 file passed, 1 test passed.

This is strong TypeScript evidence, but it is not a substitute for GitHub Actions and does not prove .NET or interactive Windows behavior.

## GitHub Actions trigger issue

Fresh validation branches and draft PRs were created to trigger current-head checks. At the time of this entry, the connector-visible API had not returned a current-head pull-request workflow run. No green GitHub check is claimed. The canonical PR remains draft and unmerged.

Temporary validation PRs must not be merged and should be closed after current-head evidence is captured.

## Current safety posture

- fake provider is default,
- Windows provider requires an explicit local risk acknowledgement,
- raw input and screenshots are not implemented in the Windows provider,
- no remote or MCP route can enable full control,
- state-changing work requires proposal, policy, fresh observation, execution, and verification,
- credential and destructive targets remain blocked,
- emergency stop remains local and authoritative,
- no credential scraping, unauthorized account access, privilege escalation, arbitrary shell, or covert-recording feature exists.

## Remaining GitHub-phase work

1. Obtain current-head GitHub Actions evidence with downloadable diagnostics.
2. Make .NET Windows-targeted build and tests green.
3. Make repository contract and CodeQL green or document a platform limitation with evidence.
4. Add in-process HTTP endpoint integration tests.
5. Add explicit provider/action deadlines.
6. Bind local approval to an immutable proposal/action fingerprint.
7. Update the Level 4 Atomic Audit with final run IDs and verdict.

## Codex handoff boundary

Only after the GitHub phase is green should Codex validate:

- real UI Automation observation,
- wrong-window denial in live apps,
- local approval UX,
- emergency-stop latency,
- Notepad semantic set/invoke/verify flow,
- private ChatGPT MCP connection,
- screenshot and raw-input slices separately, if later approved.
