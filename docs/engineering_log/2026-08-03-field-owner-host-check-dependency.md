# Engineering Log — Field Owner Host Check Dependency

**Date:** 2026-08-03

## Goal and gate

Close the L1 installed provisioning dependency discovered by live service execution:
install and hash-bind the fixed read-only host-capability script required by the fixed
provisioning script. No phase promotion is claimed.

## Ownership and authority impact

Field environment authority only. The plan and installed policy gain one SHA-256 field
for `Test-ExosuitFieldHost.ps1`; the installer copies it beside provisioning and the
service validates it at startup/job processing. Jobs still cannot select a path,
script, command, operation, policy, or capability. Glove, pilot, model, MCP, consent,
recording, key, export, and personal-state authority are unchanged.

## Evidence, assumptions, and tests

Provision job `3d6b65a7-89c7-4196-930b-c9758913ea1c` reached the fixed script and
failed because the installed sibling was absent. Bounded stderr contained only the
missing fixed path. Reconciliation proved the exact generation root absent and the
service running; no retry was issued. The repair updates policy validation, installed
digest validation, install-plan generation, reviewed-input verification, copy and
post-copy verification, and static/.NET tests.

The repaired source passed the focused Windows static suite (12/12), focused .NET
owner-service tests (7/7), Release build with zero warnings, and the fast fabric
(5/5). Exact clean-head validation passed all required repository, plan, contract,
TypeScript, pulse, build, .NET, Windows-script, and host-capability gates at commit
`b9ae784`; its preserved runner directory is
`artifacts/field-validation/20260803T142921Z`. The .NET totals were 81/81, the
focused Field total was 161, and the full TypeScript total was 333.

One reviewed upgrade installed policy `3de9c396-5e4c-4266-92fa-4c8990ec6187`,
including the exact host-check digest. Seven pre-existing disposable generation
roots were retired through exact owner-service destroy jobs after their contents
were reconciled as VM configuration, OS overlay, and task disk only. Registered
base images v22, v23, and v24 remained read-only and digest-identical.

Fresh development Field `c7dead44-f5e4-48c8-aa2d-a12a8902ea75`, generation 1,
provisioned successfully through owner-service job
`8c85cbe4-8b78-4171-9ebd-20e772a768d7`. Sixty bounded, authenticated, read-only
observation jobs then failed closed with the stable error `Required guest KVP item
is missing: Exosuit.Field.Handshake`. This is L3 negative readiness evidence, not
a readiness pass. Exact generation 1 destroy job
`62e633b9-661a-45a5-b96d-227263df57e7` succeeded.

The same Field ID was then advanced monotonically to generation 2. Provision job
`a106d95f-d554-4fe5-b87a-9060c3958655` succeeded and produced only its generation
root, one disposable differencing OS overlay, one disposable task disk, and Hyper-V
VM state. Exact destroy job `c9d8a10f-4772-4344-8382-db27650cbd3a` succeeded.
Afterward the generation root was absent, the active-generation-root count was zero,
the service remained running, and immutable base v24 remained read-only at SHA-256
`62c29338163d108d6262507c05f24f624984bdb8dea512a7077d44584faf7b1d`.

This evidence proves the bounded development L1 owner-service
provision/destroy/replacement slice. It does not prove guest readiness, production
authentication, key rotation, lock/Secure Desktop behavior, recording, input,
artifact transfer, isolation failure injection, or production readiness.

## Parts, assumptions, and impact

Parts & Pieces patterns considered were exact path scope, typed generation identity,
immutable-base/disposable-overlay separation, bounded terminal evidence, and
fail-closed retry discipline. No donor tests are treated as Exosuit evidence. The
working assumption was that historical roots were disposable because each was
confined beneath its exact generation directory and contained no personal-state
disk; this was verified before deletion. Identity and policy did not expand: jobs
remained bound to exact Field ID, generation, operation, source head, installed
policy, fixed scripts, and fixed digests. No data crossed from another Field or the
host, and no recording or pilot policy creation was enabled.

Commands actually run included the focused Windows/.NET/fast gates, `npm run
build:exact`, the one-UAC reviewed installer, exact owner-service job submissions,
bounded authenticated observations, filesystem reconciliation, and SHA-256/read-only
base checks. Evidence is local-host class H for lifecycle and immutable-base checks,
and negative H for the missing guest handshake.

## Security, privacy, and rollback

The host checker is read-only and accepts only the fixed storage root derived inside
the installed provisioning script. Its bytes are administrator/SYSTEM-owned and
hash-bound. No secrets, screenshots, UI text, or demonstration bytes enter its report.
Revert this slice and reinstall to restore the prior safe pre-effect denial; stop the
service to deny all new lifecycle work. The destroyed disposable generations are not
recoverable from their generation roots; their bounded result/timeline evidence is
preserved under ignored local artifacts. No personal-state or base disk was removed.

## Next slice

Repair and rebuild the guest image/runtime path that must publish the authenticated
KVP handshake, then repeat a fresh-generation readiness ceremony. Do not promote L3
or production until that evidence and its required negative matrix pass.
