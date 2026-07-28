# Level 4 Addendum: Durable Bootstrap Enrollment

**Date:** 2026-07-28

**Verdict:** source and focused-test pass; live repaired-generation proof pending

## Safety question

Can a stale bootstrap manifest authorize a new Field, can enrollment cross a manifest or Field generation, or can reboot bypass identity, display, policy, attestation, lock, Secure Desktop, heartbeat, and channel checks?

## Triggering evidence

Disposable v13 was gracefully rebooted and the owner logged into the standard `ExosuitDev` account through VMConnect Basic Session. A bounded ten-minute host monitor observed no new KVP heartbeat. The matching host seed manifest expired on 2026-07-27, so the 2026-07-28 startup precheck denied the restart before agent launch. This correctly failed closed but showed that a short first-use authorization had been incorrectly reused as a permanent runtime prerequisite.

## Implemented controls

- Expired first use remains denied when no enrollment exists.
- Enrollment records contract version, exact manifest digest, complete Field identity, and canonical UTC enrollment time.
- Enrollment time must be at or after manifest creation and strictly before expiry.
- Guest enrollment is confined beneath `C:\Exosuit\Config`.
- Guest writes through a same-directory temporary file and refuses an overwrite race.
- Static identity, directory, display, and agent-digest checks must pass before enrollment is written.
- The TypeScript host evaluator independently validates digest, full identity, and authorization window.
- The .NET KVP runtime preserves enrollment inside the authenticated bootstrap report.
- Runtime readiness checks and authenticated channel controls are unchanged.

## Negative tests

- expired manifest without enrollment;
- wrong enrollment manifest digest;
- wrong enrollment identity;
- enrollment at manifest expiry;
- enrollment path escaping the approved guest configuration root;
- source guard against deriving enrollment time from manifest expiry.

## Residual risk and hold

The current v13 image does not contain the repair and has no enrollment marker. It remains negative evidence only. No live readiness or reboot-repeatability claim follows until a replacement disposable generation enrolls inside its window, reboots, and produces fresh signed KVP readiness evidence. Production remains denied.

## Rollback

Revert the source slice or disable the guest task. Destroying the disposable generation removes its enrollment with the overlay. Removing enrollment after manifest expiry causes a fail-closed startup and does not mint a replacement authorization.
