# Engineering Log — HYP-001 execution runbook

**Date:** 2026-08-08
**Branch:** `codex/handoff-post-secureboot`
**Master-plan phase / gate:** M1 / HYP-001
**Subsystem ownership:** Field, with the shared completion-evidence boundary

## Goal

Put the exact HYP-001 operator procedure on the executable branch, align it
with the current pre-apply resource guards, and remove an unsupported claim
that the raw preflight JSON is signed completion evidence.

## Files changed

- `docs/project-driver/HYP001_SESSION_RUNBOOK.md`
- `docs/DEVELOPER_HANDOFF.md`
- `tests/hyp001Harness.test.ts`
- this engineering log

## Identity, generation, and policy impact

No runtime identity or policy contract changes. The runbook preserves one Field
ID across three fresh increasing generations, exact-generation destruction,
the immutable base boundary, Private networking, and deny-before-apply
preflight behavior. The pilot gains no Field or Glove authority.

## Parts & Pieces and donor patterns considered

Applied the existing evidence-source guard, check-runner, event-ledger,
reconciliation, path-confinement, and typed-confirmation patterns. No donor
runtime or donor evidence is claimed.

## Questions and assumptions

- The 2026-08-08 preflight observations are host facts, not permanent facts;
  apply re-measures them.
- An Off legacy G4 VM is non-blocking and must not be removed as unrelated
  cleanup.
- HYP-001 proves lifecycle behavior only; channel and guest readiness remain
  separate gates.

## Tests and commands

To be filled with commands actually run after implementation. Planned minimum:

- `npm run test:hyp001`
- `npm run validate:repository`
- `npm run validate:plan`
- `npm run validate:field-contract`
- `npm run typecheck`
- `npm run build`
- `npm run hyp001:cycles` (dry run only)
- `git diff --check`

### Live-discovered defect

The first elevated apply attempt stopped before plan creation with a Zod error:
the harness requested 1024 MiB minimum / 2048 MiB startup while the Field plan
requires at least 2048 / 4096. No VM or generation was created. The harness now
uses the smallest schema-valid 2048 / 4096 / 4096 profile from a pure exported
constant covered by the HYP test suite.

The second elevated apply reached the schema-valid plan, then stopped before
mutation because the non-interactive harness did not pass `-Confirm:$false` to
the High-impact `ShouldProcess` scripts. Exact typed confirmation was already
present. Provision and exact-generation destruction now both add the explicit
common parameter, with a static regression assertion that requires both typed
confirmation and exactly two prompt suppressions.

Native Windows PowerShell 5.1 then rejected the textual `-Confirm:$false`
passed through `-File` because it cannot convert that argv string to a switch.
The final adapter is restricted to the two exact lifecycle scripts and a fixed
parameter allowlist, single-quotes every value, and uses UTF-16LE
`-EncodedCommand` so `$false` remains a PowerShell boolean. It preserves
non-interactive fail-closed execution without opening an arbitrary command
surface.

## Security and privacy impact

The change narrows evidence claims: unsigned host observations cannot be
mistaken for signed completion evidence. No secrets, screenshots, private UI
text, VM tokens, or demonstration data are added. No recording or input path is
enabled.

## Evidence class and unvalidated areas

Three `hyperv_host_guest` records were produced for one Field across generations
1, 2, and 3. All generations were destroyed and the base remained unchanged.
HYP-001 promotion remains unvalidated pending independent review. Channel
behavior, Teach recording, prediction, Pilot execution, MCP, and owner
acceptance remain unvalidated.

## Rollback / disable path

Revert this documentation-and-test slice. No VM or completion-ledger state is
created by the change. A failed dry run provisions nothing.

## Next recommended slice

Have an independent technical reviewer inspect
`docs/qa/HYP001_LIVE_EVIDENCE_2026-08-08.md`, especially the disclosed dirty
harness checkout. Promote only if accepted; otherwise rerun from a clean
approved commit. After HYP passes, proceed to CHN-001.

## Actual results

- final elevated preflight: passed, zero failures, 4.20 GiB free;
- HYP live run: 3/3 cycles, readiness 11/13/12 seconds;
- base digest: unchanged in every cycle;
- cleanup: generations 1/2/3 removed; legacy G4 remains Off;
- signed records: three, `hyperv_host_guest`, TPM-backed;
- completion/reconciliation/scan: passed with zero integrity or scan findings;
- HYP focused tests: 39/39 passed;
- Windows script tests: 8/8 passed;
- full TypeScript: 91 files, 644/644 passed on rerun;
- Field suite: 48 files, 239/239 passed;
- .NET: build 0 warnings/errors, 48/48 tests passed;
- system and Field pulses: 1/1 each;
- promotion: not performed; independent reviewer required.
