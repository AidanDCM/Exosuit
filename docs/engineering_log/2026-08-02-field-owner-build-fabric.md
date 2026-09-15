# Engineering Log — Field Owner Build Fabric

**Date:** 2026-08-02
**Goal:** reduce repeated UAC/manual lifecycle overhead without weakening Field authority,
generation, policy, evidence, or stop boundaries.
**Master-plan phases/gates:** L1-L3 foundation and L16 reliability tooling; no phase
promotion claimed by source or installation alone.
**Subsystem:** Field.

## Change summary

- added a separate .NET LocalSystem Field owner service;
- added strict expiring policy and fresh exact-generation job contracts;
- limited the service to `provision`, authenticated read-only `observe`, and `destroy`;
- fixed and hash-bound lifecycle scripts, host configuration, observer script, and
  compiled observer;
- added an atomic owner-writable pending queue, protected processing/results/evidence
  roots, exclusive snapshot copy into a fresh protected directory, replay checks,
  active-Field bound, reparse/shape checks, process-tree
  cancellation, and exact-package cleanup;
- added one-UAC plan/install launcher, non-elevated job submitter, and bounded uninstall;
- added the machine-readable slice contract, parallel fast-feedback runner, and exact
  evidence entry point;
- updated roadmap, architecture, manuals, security model, threat model, failure matrix,
  traceability, decision log, README, and Level 4 audit.

## Identity, policy, and generation impact

Every service job binds an owner policy ID, unique job ID, source head, timestamps,
exact Field ID/generation, operation, and input digests. The pilot cannot alter the
installed policy or request any operation outside the fixed vocabulary. Rebuild and
rollback still invalidate prior generations. The service creates no Field operating
policy, consent, attestation, key, demonstration deletion, export approval, mode, or
full-control authority.

## Parts & Pieces and donor patterns

The slice reuses Exosuit's existing fake-first authority separation, strict provisioning
plan, fixed-script guest-service pattern, exact path scope, atomic publication, bounded
evidence, and deny-before-effect rules. No donor code or donor tests are used as Exosuit
evidence. A generic privileged broker was considered and rejected.

## Questions and assumptions

- The owner is intentionally granting standing development lifecycle authority for no
  longer than 180 days.
- Provision, observe, and destroy are sufficient for the first accelerated canary loop;
  start/restart, base registration, policy change, recording, and key rotation remain
  outside the service.
- The current local host configuration is the installation snapshot; changing it
  requires a reviewed policy replacement.

## Files changed

See the exact Git diff for this slice. Primary implementation paths are
`apps/field-owner-service`, `scripts/windows/*ExosuitFieldOwner*`,
`development/current-slice.json`, `scripts/build-fast.mjs`, and associated tests/docs.

## Tests and commands actually run so far

- user-local .NET restore: passed;
- .NET Release build with warnings as errors: passed, zero warnings/errors;
- focused `FieldOwnerServiceTests`: 7/7 passed after adding oversized-output drain coverage;
- all five new PowerShell scripts parsed successfully;
- development-slice validator: passed;
- focused owner-service Windows script test: passed;
- the first full `windowsFieldScripts.test.ts` run reached 10/11 because the pre-existing
  protected-secret multi-process harness exceeded its 60-second whole-test timeout under
  host load. Its assertions did not fail, and the new owner-service test passed. The
  aggregate harness bound is now 120 seconds for seven Windows PowerShell startups; all
  product deadlines remain unchanged;
- full TypeScript suite rerun: 64 files and 332/332 tests passed;
- fast build fabric: 5/5 gates passed in 35.9 seconds with evidence under
  `artifacts/build-fabric/20260802T162651Z`;
- unified Windows validation: all 14 steps passed in 368.4 seconds with evidence under
  `artifacts/field-validation/20260802T162731Z`;
- post-review .NET Release build: passed with zero warnings/errors; focused owner-service
  tests 7/7 passed; slice validation and `git diff --check` passed.

## Security and privacy impact

This adds privileged code and is therefore a critical review surface. Risk is reduced by
separate identity, no model-facing endpoint, fixed vocabulary, fixed installed commands,
hash verification, exact generation, freshness/replay checks, ACL separation, bounded
output, and no recording/key/export authority. Host/guest secrets are not logged or
committed. Consumed seed/secret packages are removed from the active namespace without a
forensic-erasure claim.

## Assumptions and unvalidated areas

- the recorded unified run was made from the reviewable working tree; a clean exact-head
  qualification is still required after commit;
- no service has been installed yet;
- Windows service identity, ACLs, SCM configuration, tamper denial, live queue behavior,
  cancellation, Hyper-V effects, observation, destruction, and uninstall are unvalidated;
- hosted CI remains blocked by GitHub billing;
- source success is not live Field or production evidence.

## Rollback/disable

Stop `ExosuitFieldOwner` to deny new jobs. The elevated uninstall script requires the
exact phrase `UNINSTALL EXOSUIT FIELD OWNER SERVICE`, preserves sanitized evidence, and
removes only the service registration, installed executable, policy/configuration copy,
and queue. It does not delete Fields, base images, personal state, or task evidence.

## Next recommended slice

Complete the full repository gates, commit the reviewable slice, run exact-head local
validation, display the install plan, obtain the single UAC approval, then execute the
installation/ACL/tamper acceptance matrix before submitting any live lifecycle job.
