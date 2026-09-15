# Atomic Audit — Mutable Personal-State Identity

**Date:** 2026-07-22
**Subsystem:** Field storage and provisioning
**Issue:** #20
**Evidence target:** source/unit/static-script validation only; no live Hyper-V claim

## Boundary reviewed

The persistent personal-state VHDX is writable and therefore cannot retain a permanent whole-file digest. The immutable base image remains digest-bound. The replacement contract binds personal state through a stable local disk ID and positive monotonic disk generation. Both values are required together and must match the local host registry before VM mutation.

## Authority and failure behavior

- The pilot cannot create or change personal-state identity.
- The host-owned registry resolves the exact disk ID/generation tuple.
- Missing, partial, stale, duplicate, or mismatched identities fail closed before VM creation.
- The disk must remain registered as encrypted.
- Replacement, restoration, or migration requires generation increment outside the pilot boundary.
- Destruction remains confined to the disposable Field generation root and cannot target personal-state paths.
- Sealed snapshot digests are a future restore-integrity surface and are not treated as identity for an attached writable disk.

## Evidence and residual risk

TypeScript and .NET contract tests cover paired identity and positive generation. Provisioning-plan tests cover exact tuple matching. Static PowerShell tests and parsing cover removal of writable-disk hashing. Live registry protection, encryption verification, snapshot sealing, migration, corruption recovery, and Hyper-V attachment remain unvalidated and release-blocking.

## Rollback

Revert this contract slice before any live Field exists. Do not restore the permanent writable-disk digest design; if this schema is rejected, keep persistent personal state disabled until another reviewed stable-identity design is approved.
