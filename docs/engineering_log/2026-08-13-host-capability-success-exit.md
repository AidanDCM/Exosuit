# Host capability success exit

- Goal: prevent a successful current host-capability contract from being rejected because `$LASTEXITCODE` still describes an earlier native or script failure.
- Master-plan phase and gate: M2 Field provisioning support for SCN-001; no promotion is claimed.
- Subsystem ownership: Field host provisioning only; Glove authority is unchanged.
- Live evidence: generation-12 provisioning rejected `Host capability check did not pass` while a direct check reported every capability true and `ready: true`. The check script exited 2 on failure but had no explicit success exit, leaving its caller able to observe stale nonzero state.
- Files changed: `Test-ExosuitFieldHost.ps1`, Windows-script static tests, the Field failure matrix, this log, and the Level 4 audit.
- Identity/generation/policy impact: none. The exact plan, base digest, generation, typed confirmation, and host contract remain mandatory. The pilot cannot create or expand policy.
- Parts & Pieces and donor patterns: retained the existing structured readiness contract and explicit non-ready exit; no donor code was imported.
- Tests: static coverage pins explicit exit 2 for denial and exit 0 for success. A live stale-exit regression proved 37 becomes 0 after a ready check. Repository/plan/Field-contract validators, typecheck/build, 51 Field files / 263 tests, 112 complete TypeScript files / 875 tests, both pulses, warning-free Release .NET build, and 288/288 Windows-agent tests passed.
- Security/privacy: no new data, transport, recording, input, secret, or authority. A false denial is removed; a false readiness cannot be created because exit zero occurs only after the computed `ready` check.
- Failure behavior: any false capability still exits 2 and provisioning refuses before VM creation. Success sets an unambiguous current invocation result.
- Storage/rollback: host script only; immutable guest base and disks are untouched. Revert this commit to restore the old behavior.
- Next recommended slice: regenerate exact-commit generation-12 preparation and retry provisioning on the now-passing host.
