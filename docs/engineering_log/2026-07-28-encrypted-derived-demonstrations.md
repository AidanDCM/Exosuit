# Encrypted Derived Demonstration Store

## Goal

Persist processed personal behavior across restart without plaintext leakage and propagate source deletion to future retrieval.

## Files changed

- `src/encryptedProcessedDemonstrationStore.ts`
- `tests/encryptedProcessedDemonstrationStore.test.ts`
- `scripts/validate-field.mjs`
- `package.json`
- Field status, test plan, handoff, traceability, and Level 4 audit documents

## Parts & Pieces and donor patterns considered

The implementation adapts the existing encrypted demonstration and encrypted workflow checkpoint stores: AES-256-GCM, authenticated identity, strict schema, bounded sizes, private create-new temporary files, atomic rename, authenticated listing, and explicit deletion. The corpus wrapper adds privacy-first derived-before-source deletion order.

## Tests added or updated

- encrypted processing, restart hydration, and absence of semantic/operator plaintext;
- wrong-key hiding and ciphertext-tamper authentication failure;
- coordinated source/derived deletion and empty rehydration;
- weak-key, missing-source, and size-limit denial.

## Commands actually run and results

- Focused runtime suite — 13/13 passed.
- `npm run typecheck` — passed.
- The first Field validator run found only a case-sensitive invariant-string mismatch; the sentinel was corrected.
- `npm run validate:typescript` — passed: 60 files, 301/301 tests, build, Glove pulse, and Field pulse.
- `$env:PATH = \"$env:USERPROFILE\\.dotnet;$env:PATH\"; dotnet test apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --configuration Release` — passed: 44/44.

## Assumptions and unvalidated areas

The caller protects and supplies a distinct 32-byte key. Windows key storage/rotation, ACL verification, deletion crash injection, direct lower-level deletion bypass prevention, migration, and real owner-data inspection remain unvalidated.

## Security impact

Positive: derived personal behavior no longer needs plaintext persistence, corrupt/wrong-key records fail closed, and coordinated deletion removes derived retrieval state before source evidence. No runtime capture or input permission was enabled.

## Rollback or disable path

Do not construct the derived store or corpus; remove the derived directory through the owner deletion path. Source episodes remain governed by the existing encrypted store.

## Next recommended slice

Wire a read-only live scene/observation adapter with process-level Shadow isolation, then run owner-reviewed relevance and calibration evidence.
