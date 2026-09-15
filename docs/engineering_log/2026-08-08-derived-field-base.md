# Derived immutable Field base

## Goal and gate

Add a reproducible, one-transaction host path for the component-only base update needed
by M1/CHN-001. This builds a candidate image; it does not accept the image or promote a
gate.

## Ownership and files

Field-owned host maintenance. Added `New-ExosuitDerivedFieldBase.ps1`, static tests,
master-plan storage law, architecture/runbook/decision/threat/failure documentation,
and Level 4 audit.

## Authority, identity, and storage impact

The operation requires local administrator elevation, exact typed confirmation, exact
clean source commit, accepted source image ID/path/digest/read-only state, unique target
ID/path, fixed component paths/digests, and an exact evidence directory. It creates no
Field generation and grants no Glove, pilot, model, MCP, recording, key, policy, export,
or input authority.

The accepted v25 source is never mounted and remains read-only. Only a uniquely named
temporary copy under `C:\ProgramData\Exosuit\Images` is writable. No personal-state or
task disk is touched. The target is published only after offline verification, dismount,
hash, and read-only marking. Failure removes only the exact temporary/published v26
copy and never the source.

## Parts & Pieces, assumptions, and privacy

Applied exact path scope, no overwrite, content addressing, atomic publication,
bounded rollback, and deny-by-default configuration checks. This fast path assumes the
source is already generalized and accepted and the change is limited to the existing
agent/launcher/SetupComplete component set. Machine state, accounts, applications,
Windows features, or service-registration changes require the full Audit Mode/Sysprep
path. No secret, UI text, screenshot, demonstration, or token is processed.

## Tests and evidence

The exact single-file win-x64 agent was published from the reviewed source; candidate
SHA-256 is `037eb7153d14e88e23187789ca44d55146205885d2599c3d58c353a137052dd4`.
PowerShell parser, Windows static tests, repository/plan/Field validators, and complete
exact-head validation passed on the first script commit. The first elevated derivation
failed closed before publication because inherited v25 agent-file ACLs permitted an
untrusted write principal. The temporary copy was removed, no v26 target remained, and
v25 remained read-only. The script now replaces ACLs on the derived agent directory,
every fixed component, and SetupComplete with exact SYSTEM/Administrators Full Control
and Users Read & Execute rules, then rechecks SIDs for any untrusted write right.

After the ACL remediation passed the exact-head validation lane at commit
`99217dac4b7eee51458a61843a6c372336ce13ec`, the elevated offline derivation completed
successfully. The content-addressed receipt is
`artifacts/base-v26-build/evidence/derived-base-receipt.json`. Independent post-run
hashing confirmed v25 remained read-only at
`5ec795fe378d256131e4e1c89c597a79a30e8923cafa3df6b793e7c125a2c744`; v26 is read-only
at `19a1c58fc1585fbde9a5325746c6ff1442964e471a5dcf6a46bc1a237e8fc1cf`; and no
temporary `.building.vhdx` remained. This proves offline derivation only. v26 still
requires disposable-Field boot, guest-readiness, lifecycle, and destruction acceptance.

## Rollback

Before host-registry acceptance, remove only the failed/new v26 candidate after proving
it is not mounted and no overlay references it. After registry acceptance, first remove
the v26 registry entry and destroy all exact dependent generations. v25 remains the
known rollback image.

## Next slice

Run dry-plan, launch the single elevated derivation transaction, review the receipt and
source/target hashes, then register and guest-accept v26 before CHN-001 acquisition.
