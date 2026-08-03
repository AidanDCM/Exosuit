# Engineering Log — Field Owner Installer SID Fix

**Date:** 2026-08-02

## Goal and gate

Correct the L1-L3 Field owner installation gate after live elevation proved that
`icacls` rejected the exact owner SID while granting pending-queue access. No phase
promotion is claimed.

## Ownership and impact

This is a Field-owned installer-only correction. It does not alter Field identity,
generation, lifecycle vocabulary, Glove policy, recording consent, keys, exports, or
MCP authority. The pending queue remains the only owner-writable service surface.

## Change and evidence

The first correction used `icacls` raw-SID syntax with a leading `*`, but a second live
attempt proved that the pending-queue grant still failed before SCM service creation.
The installer now avoids native account-name translation for this grant: it constructs
a typed `SecurityIdentifier` and inheritable `FileSystemAccessRule` granting `Modify`
to the exact reviewed owner SID. Static regression assertions require that typed path.
Both failed attempts created protected install/data roots and failed closed before SCM
service creation; read-only checks proved that no service existed.

Commands and final results will be captured by the exact-head validation artifact and
the post-install acceptance checks. Live installation remains unvalidated until those
checks pass.

## Security, privacy, rollback, and assumptions

The fix grants Modify only to the exact reviewed owner SID on `Queue\Pending`; SYSTEM
and local Administrators retain full control through the protected parent. It adds no
data collection or transfer. The corrected installer safely replaces the partial
protected roots during its next elevated run. If installation fails again, absence of
the SCM service keeps job execution denied; the bounded uninstall script remains the
rollback path after successful installation.

## Next slice

Run focused and complete exact-head validation, then retry installation and verify
service identity, hashes, ACLs, recovery settings, policy validation, and safe job
denial behavior.
