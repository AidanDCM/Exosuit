# Atomic Audit — Field Channel Canonical Time

**Date:** 2026-07-25  
**Depth:** Level 4 — authenticated cross-language trust boundary  
**Branch:** `agent/github-completion-contract-hardening`  
**Scope:** Field channel timestamp creation, wire parsing, signing, and verification  
**Verdict:** source change is reviewable and deny-by-default; executable promotion remains blocked

## North Star check

This change strengthens the owner-authorized Glove–Field channel without adding execution, recording, stealth, browser-specific control, or model authority.

## Authority review

- the pilot cannot select a weaker timestamp format;
- local TypeScript and .NET channel code own parsing and normalization;
- policy, consent, VM administration, key rotation, and emergency stop are unchanged;
- noncanonical wire values fail closed.

## Threat reviewed

Before this change, TypeScript signed the exact supplied ISO string while .NET reconstructed a fixed three-fractional-digit UTC string. Equivalent instants could therefore produce different signed canonical JSON across languages.

The source now defines one representation:

```text
YYYY-MM-DDTHH:mm:ss.SSSZ
```

Controls:

- TypeScript creation rejects alternate string representations;
- TypeScript schema rejects alternate envelope representations;
- .NET creation normalizes to UTC millisecond precision;
- .NET raw wire parsing requires the exact representation;
- .NET verification rejects non-UTC or sub-millisecond in-memory timestamps;
- existing canonical fixture remains unchanged.

## Negative cases

Tests now cover:

- missing fractional seconds;
- `+00:00` instead of `Z`;
- non-UTC offsets;
- excessive fractional precision;
- invalid calendar dates;
- noncanonical `sentAt`;
- noncanonical `expiresAt`;
- sub-millisecond in-memory .NET timestamps.

## Failure behavior

All invalid cases throw or fail schema parsing before ordinary channel acceptance. No fallback format and no silent coercion of supplied TypeScript wire strings is allowed.

## Compatibility

- canonical existing fixtures remain valid;
- default TypeScript timestamps already use `Date.toISOString()` and remain compatible;
- .NET locally created timestamps are normalized before signing;
- any caller currently supplying a valid but noncanonical ISO string must change to the canonical form;
- future .NET transport deserializers must use `ParseWireTimestamp` rather than permissive `DateTimeOffset` parsing.

## Privacy review

No personal data, screenshots, demonstrations, credentials, browser content, files, or host information are added or logged.

## Evidence reviewed

- source changes in TypeScript and .NET;
- TypeScript unit and fixture tests written;
- .NET unit and fixture tests written;
- isolated TypeScript compiler check passed with dependency stubs;
- GitHub Actions execution remains unavailable because jobs are receiving no steps or logs;
- .NET, Windows, Hyper-V, and live transport execution were not performed.

## Residual risk

- replay protection is still memory-only and restart-unsafe;
- actual transport serialization may bypass the new .NET raw parser unless integration explicitly uses it;
- key rotation and persistent replay state remain unresolved;
- branch-wide compile and test evidence is absent.

## Rollback

Revert this audit and the associated source/test commits. The change creates no persistent runtime state and requires no data migration.

## Promotion decision

- source review: acceptable;
- merge to production branch: hold pending exact-head execution;
- L0: not passed;
- L2: not passed;
- live transport: denied;
- production: denied.