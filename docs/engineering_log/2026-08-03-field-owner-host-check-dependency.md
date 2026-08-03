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

Focused, full, exact-head, replacement-installation, and live provision tests remain
required and will be recorded by their evidence runners and terminal service results.

## Security, privacy, and rollback

The host checker is read-only and accepts only the fixed storage root derived inside
the installed provisioning script. Its bytes are administrator/SYSTEM-owned and
hash-bound. No secrets, screenshots, UI text, or demonstration bytes enter its report.
Revert this slice and reinstall to restore the prior safe pre-effect denial; stop the
service to deny all new lifecycle work.

## Next slice

Run focused and complete source gates, commit, exact-head validate, reinstall once,
then submit a newly generated exact provision/observe/destroy acceptance generation.
