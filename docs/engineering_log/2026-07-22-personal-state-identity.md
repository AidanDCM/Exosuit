# Engineering Log — Personal-State Stable Identity

**Date:** 2026-07-22
**Master-plan phase:** L0 contract repair prerequisite for L1 Hyper-V lifecycle
**Subsystem:** Field
**Starting commit:** `e0c6c357a7c4898605eb9c334f18549501380da5`

## Goal and promotion gate

Resolve issue #20 by replacing the contradictory permanent digest identity for a writable personal-state VHDX with a stable disk ID and monotonic generation. This slice does not promote L1 and makes no live Hyper-V claim.

## Identity, generation, and policy impact

Field identity now optionally carries `personalStateDiskId` and `personalStateGeneration` as an all-or-nothing pair. Provisioning binds the exact tuple to a host-owned registry entry and requires the disk to be registered as encrypted. Field generation, Glove authority, policy, recording consent, and action execution are unchanged. The pilot cannot create or expand this identity.

## Files changed

TypeScript and .NET Field contracts, provisioning plans, cross-language fixture/tests, guarded PowerShell provisioning and guest bootstrap scripts, example host configuration, Field architecture/boundary/test/threat/failure documents, and this slice's Level 4 audit.

## Parts & Pieces and donor patterns considered

Applied stable identity plus generation, fail-closed registry resolution, path-scope/destruction confinement, evidence-source separation, and immutable-versus-mutable storage separation. No donor code was copied.

## Questions and assumptions

- Normal writes must not require identity rotation; replacement, restore, or migration must.
- A host registry entry is local authority, not model-supplied authority.
- Encryption is registry-declared in this source slice; live verification remains required.
- Sealed snapshot integrity is deliberately separate and not implemented here.

## Tests and commands

Contract tests cover paired fields and positive generations; provisioning tests cover tuple mismatch; cross-language fixture and script tests are updated. Commands and exact results are recorded after validation below.

Validation exposed pre-existing exact-head test/build defects: a missing parenthesis in the bootstrap negative test; pulse and channel fixtures with schema-invalid UUIDs; an invalid TypeScript `as const` assertion on the checkpoint schema-version constant; and a visual-retention negative test whose expiration violated policy before reaching the asserted missing-change-score condition. The signed cross-language fixture was regenerated after correcting its UUID identities. The complete suite also exposed a real prompt-injection guard gap: the scanner recognized “ignore your previous instructions” but not the common “ignore previous instructions” form. The pattern now covers both, restoring fail-closed browser mutation behavior. These corrections do not expand runtime authority and are included in the rerun.

The full-suite rerun also exposed a nondeterministic signature-tamper test: altering the final Base64URL character can leave decoded bytes unchanged because of unused trailing bits. The negative test now mutates the first character, which deterministically changes authenticated bytes.

Commands actually run:

```text
npm install --ignore-scripts --no-package-lock
npm run validate:repository
npm run validate:plan
npm run validate:field-contract
npm run typecheck
npm run test:field -- --reporter=verbose
npm run test:field-pulse -- --reporter=verbose
npm test -- --reporter=verbose
npm run build
npm run test:pulse -- --reporter=verbose
PowerShell parser over scripts/windows/*.ps1
dotnet --info
dotnet restore apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj
```

Results and evidence class:

- repository, master-plan, and Field-contract validators passed;
- strict TypeScript typecheck and production build passed;
- focused issue tests passed, 22/22;
- Field suite passed, 105/105;
- full TypeScript suite passed, 231/231 across 54 files;
- fake Field pulse and shared Glove pulse passed;
- every Windows Field PowerShell script parsed successfully;
- dependency installation reported two moderate advisories; high/critical audit and lockfile remediation remain issue #21 work;
- .NET restore/build/test could not run because this host has the .NET 8 runtime but no SDK;
- evidence is source, unit/integration, fake-pulse, build, and static PowerShell evidence only—not live Hyper-V, encryption, attachment, migration, or Windows-agent evidence.

## Security and privacy impact

The change removes a false integrity guarantee while preserving deny-by-default attachment. It does not expose disk contents or add recording/input authority. Remaining release blockers include registry tamper resistance, protected storage, snapshot integrity, migrations, and corruption recovery.

## Rollback or disable path

Revert this slice before live use, or omit both personal-state identity fields to provision a disposable Field without personal state. Do not fall back to a permanent hash of the writable VHDX.

## Next recommended slice

Complete issue #21 as a separate reviewable dependency-reproducibility slice, then run the complete L0 validator on an authenticated Windows checkout.
