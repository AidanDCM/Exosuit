# Level 4 Addendum: Encrypted Derived Demonstrations

**Date:** 2026-07-28

**Verdict:** source/file privacy gate pass; live key operations and owner-data evidence unproven

## Safety question

Can processed personal behavior appear in plaintext, be hydrated under the wrong identity or key, survive source deletion in the retrieval path, or be silently accepted after corruption?

## Implemented controls

- Derived records use AES-256-GCM with a distinct required 32-byte key.
- Additional authenticated data binds format version, hashed source episode identity, hashed Field generation identity, and exact processing-pipeline version.
- Plaintext and encrypted sizes are bounded.
- Directories/files request private modes; writes use create-new temporary files and atomic rename.
- Load validates requested source identity, decrypted source identity, Field identity, and pipeline identity.
- Wrong-key, corrupt, oversized, or inconsistent files are never listed or hydrated into retrieval.
- Restart hydration parses every authenticated record through the strict processed-demonstration schema.
- The corpus wrapper processes only an existing encrypted source episode.
- Source deletion removes derived behavior first, then source evidence. A partial failure can retain encrypted source evidence but cannot intentionally leave derived behavior retrievable.

## Residual risk and promotion limit

Key material is supplied by the caller; Windows DPAPI/credential-vault storage, rotation, backup, and recovery are not implemented. Node file modes do not prove Windows ACLs. Direct calls to the lower-level raw source store could bypass coordinated derived deletion, so runtime wiring must expose the corpus lifecycle rather than separate deletion routes. Crash/failure injection between deletion steps and real personal-data inspection remain pending.

This slice adds persistence only. It does not enable recording, visual capture, Shadow execution, Assisted Mode, Pilot, or network transfer.

## Rollback

Delete the derived directory using the reviewed owner deletion path and stop constructing the encrypted derived store. Retain or separately delete encrypted source episodes according to owner policy.
