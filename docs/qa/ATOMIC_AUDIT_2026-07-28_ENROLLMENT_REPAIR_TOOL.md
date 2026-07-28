# Level 4 Addendum: Enrollment Repair Tool

**Date:** 2026-07-28

**Verdict:** source/static pass; live mutation pending

## Safety question

Can recovery modify a running or wrong VM, follow a reparse point, inject unreviewed code, read secrets, overwrite an existing enrollment, leave an overlay mounted, or let model text authorize Field administration?

## Controls

- Exact VM and overlay paths derive from Field GUID and positive generation.
- The VM must exist in state `Off`; the script contains no start, stop, or remove cmdlet.
- Apply requires an exact local typed confirmation phrase and PowerShell `ShouldProcess`.
- Previous host and guest manifest bytes must match one reviewed SHA-256.
- Source agent and initializer must match caller-supplied reviewed SHA-256 values before and after staging.
- The guest must not already contain an enrollment marker.
- Repair is limited to an expired first-use manifest.
- Generation, seed, evidence, guest agent, and guest configuration directories refuse reparse points.
- The overlay mounts read-write only for the bounded transaction and dismount is attempted in `finally`.
- Every target is moved to a transaction-specific rollback file before replacement; partial completed swaps are restored in reverse order.
- Evidence contains identity, timestamps, paths, and hashes, not channel secret, password, manifest contents, or guest logs.

## Holds

Writable Storage-provider failure injection, host-crash recovery, base-image rebuild, and live repaired-generation readiness remain open. No production promotion follows from the tool or a single development repair.

## Rollback

Omit `-Apply`, deny the confirmation, or revert the script. On failure, use the transaction-specific rollback files only after exact offline inspection. Destroying the disposable generation removes the repaired overlay without touching the immutable parent.
