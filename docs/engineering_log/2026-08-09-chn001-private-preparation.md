# CHN-001 private preparation

## Goal and gate

Add the missing bounded preparation step for master-plan M1 gate CHN-001. The command
creates a production-isolated provisioning plan, the exact four-file guest seed, and a
matching host observation configuration. It does not provision, boot, record, execute,
destroy, or promote a Field.

## Ownership and files

This is shared Field/acceptance-harness work. `src/completion/chn001Harness.ts`, its
focused test, the Field Windows runbook, and the CHN acquisition Level 4 audit changed.
Field identity and generation are newly generated or explicitly supplied. No Glove
policy or execution authority changes.

## Boundaries and assumptions

- The plan is isolated, has no development access, personal state, LAN access, inbound
  connection, clipboard, drive mapping, or host input injection.
- The seed contains exactly the four provisioner-approved files. The same random
  generation secret is written only beneath an ignored, SID-restricted preparation
  directory for guest seeding and host verification; it is never printed or committed.
- The manifest binds the exact v26 agent digest, environment-policy digest, fixed display,
  Field/generation, and session-0 service identity.
- `bind` reads the real running VM GUID and refuses a non-running VM or changed commit.
- Preparation is not live evidence. Guest DPAPI conversion, service identity, readiness,
  replay, lock, Secure Desktop, display, heartbeat loss, emergency stop, cleanup, and
  base immutability still require separate evidence.

## Field-specific answers

Environment authority remains with the local owner service; the harness cannot expand
its policy. Rebuild/rollback requires a new Field generation. Recording is not enabled.
No data is copied from another Field or host workspace beyond the four allowlisted seed
files. Session lock, Secure Desktop, heartbeat loss, replay, uncertain effect, overflow,
and emergency stop remain fail-closed acceptance ceremonies. Only the disposable overlay
and task disk are planned; the immutable base is read-only and personal state is absent.

## Tests and commands

- `npm run typecheck`
- `npm run test:chn001 -- --reporter=verbose --maxWorkers=1 --minWorkers=1`
- repository, plan, Field-contract, exact validation, and a dry preparation are required
  after commit.

## Security/privacy and rollback

No secret, screenshot, UI text, token, or demonstration byte enters logs, tests, tool
output, or Git. Rollback is to destroy only the exact disposable generation, remove the
ignored preparation directory after evidence is complete, and revert this slice. The
next slice is live v26 provisioning followed by the CHN-001 acquisition matrix.

