# Engineering Log — Field Owner Result Read Access

**Date:** 2026-08-03

## Goal and gate

Complete the L1-L3 owner-service installation acceptance gate by allowing the exact
installing owner SID to read terminal job results and sanitized installation evidence
without elevation. No phase promotion is claimed.

## Ownership and authority impact

This is Field-owned filesystem policy. Pending remains the only owner-writable service
surface. Results and Evidence gain inherited `ReadAndExecute` for the exact owner SID;
the exact public `policy.json` gains non-inherited read access; SYSTEM and Administrators
retain write authority. The adjacent host configuration stays unreadable. Glove policy, Field identity and
generation, lifecycle vocabulary, recording consent, keys, exports, and MCP authority
are unchanged.

## Evidence and assumptions

The installed service passed SCM creation and is running as LocalSystem with automatic
delayed start and bounded recovery. Non-elevated acceptance then proved Pending visible
while Results and Evidence returned `UnauthorizedAccessException`, which would prevent
`Submit-ExosuitFieldOwnerJob.ps1 -Wait` from reading its terminal result. Static tests,
exact-head validation, and a replacement installation are required before closeout.

Replacement installation stops and retains an existing SCM registration, disposes the
temporary service-controller handle, replaces only reviewed files/policy/ACLs, reapplies
configuration, and restarts. It does not delete and recreate the service in one process,
avoiding Windows' marked-for-deletion race.

The safe nonexistent-generation probe then proved same-parent staging rename lacked the
Pending parent's `DeleteSubdirectoriesAndFiles` right. Pending now grants this narrow
right in addition to Modify; it still grants no ACL/ownership administration. Submitter
cleanup preserves and rethrows the original error even if best-effort staging cleanup
also fails.

## Security, privacy, and rollback

The owner receives no write/delete permission on Results or Evidence. These locations
must contain bounded sanitized records and never screenshot bytes, secrets, private UI
text, or raw demonstration data. Stop the service to deny new work; the exact uninstall
script remains the rollback path and preserves evidence.

## Next slice

Qualify and reinstall the ACL correction, then verify non-elevated result/evidence read,
Pending write scope, service identity/configuration, installed hashes, safe denial, and
rollback documentation.
