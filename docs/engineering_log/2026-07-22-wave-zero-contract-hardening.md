# Engineering Log — Wave 0 Contract Hardening

**Date:** 2026-07-22
**Master-plan phase:** L0
**Subsystem ownership:** Field and shared validation
**Starting commit:** `e0c6c357a7c4898605eb9c334f18549501380da5`

## Goal

Complete Wave 0 contract blockers: reproducible Node dependencies, durable bounded replay, canonical signed timestamps, canonical origins, and reviewed executable identities; then execute exact-head L0 validation.

## Files and boundaries changed

- committed npm lockfile and CI/runbook `npm ci` paths;
- TypeScript and .NET Field channel replay guards with optional atomic file persistence;
- canonical UTC millisecond signed timestamp schema;
- Field policy canonical-origin and reviewed executable name/SHA-256 identities;
- Windows PowerShell 5.1-compatible SHA-256 evidence hashing in the L0 and host validators;
- positive, negative, restart, corrupt-state, cross-identity, and cross-language tests;
- Field security, test, failure, implementation, and roadmap documentation.

The pilot cannot create policy, executable approvals, channel keys, or replay state. Persisted replay state is local authority bound to exact Field generation, direction, and key identity. No input, recording, VM, or model authority is added.

## Parts & Pieces and assumptions

Applied bounded ledgers, atomic replacement, exact identity/generation binding, fail-closed hydration, canonical serialization, and evidence-source separation. No donor code was copied. File persistence is a component capability; live transport wiring, OS ACL review, key rotation, and crash/power-loss testing remain later live gates.

## Tests and evidence

Focused TypeScript contract tests passed. The local .NET 8.0.423 SDK produced a warnings-as-errors build and 41/41 passing tests. The first exact-head L0 attempt exposed the unavailable Windows PowerShell 5.1 static `SHA256.HashData` API before any validation step ran; the validators now use the compatible instance `ComputeHash` API.

The complete L0 command was then executed on clean candidate `37000d4495cf8107526a1962f9550562bf83be20`. Evidence is under `artifacts/field-validation/20260722T205946Z/`. Reproducible `npm ci`, repository/plan/Field contracts, TypeScript typecheck, 107 Field tests, Field pulse, 233 full TypeScript tests, TypeScript build, Glove pulse, .NET restore, warnings-as-errors .NET build, and 41 .NET tests passed. The final blocking host-capability check correctly failed: Hyper-V is disabled, Hyper-V cmdlets are unavailable, and firmware virtualization/SLAT are unavailable. `npm ci` also reported two moderate transitive advisories; the available automatic fix is breaking and was not applied. Production readiness remains denied. Final exact-head evidence is generated after this log is committed so the validated commit and delivered commit match.

## Security and privacy impact

Replay survives process restart without unbounded memory growth; corrupt or cross-channel state denies startup. Timestamp ambiguity is removed from signed TypeScript messages. Arbitrary Field URL/process strings are replaced by canonical origins and reviewed executable hashes. Replay files contain identifiers and nonces but no payloads, secrets, screenshots, or private UI text.

## Rollback

Revert this slice before live transport use. If persistence cannot be trusted, keep live Field transport disabled; do not fall back to memory-only replay. If executable identity cannot be resolved, deny process authorization rather than accepting names alone.

## Next slice

Enable and review Hyper-V plus firmware virtualization/SLAT on an authorized validation host, then rerun L0. Begin Wave 1/L1 only after that gate passes.
