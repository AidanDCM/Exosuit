# Engineering Log — Field Channel Canonical Time

**Date:** 2026-07-25  
**Subsystem ownership:** Shared Glove–Field authenticated channel  
**Branch:** `agent/github-completion-contract-hardening`  
**Master-plan phase:** L2 authenticated live channel and heartbeat  
**Promotion effect:** source hardening only; L0 and L2 remain unpassed

## Goal

Remove cross-language signature ambiguity caused by TypeScript signing caller-supplied ISO timestamp strings while .NET formats timestamps with fixed UTC millisecond precision.

## Work performed

- added one canonical Field channel timestamp representation: `YYYY-MM-DDTHH:mm:ss.SSSZ`;
- made TypeScript envelope creation reject alternate ISO spellings rather than signing them;
- made the TypeScript envelope schema reject noncanonical `sentAt` and `expiresAt` values before signature verification;
- made .NET channel creation normalize timestamps to UTC and truncate to millisecond precision;
- added .NET canonical wire timestamp parser and formatter APIs;
- made .NET verification reject non-UTC or sub-millisecond envelope values and invalid expiration ordering;
- updated the .NET cross-language fixture test to parse raw timestamp text through the canonical parser;
- added TypeScript and .NET negative tests for missing fractions, offsets, excessive fractions, non-UTC spellings, and invalid calendar dates;
- updated the Field Level 4 threat model.

## Files changed

- `src/fieldChannel.ts`
- `tests/fieldChannel.test.ts`
- `tests/fieldChannelWireContract.test.ts`
- `apps/windows-agent/FieldChannelFoundation.cs`
- `apps/windows-agent.Tests/FieldChannelFoundationTests.cs`
- `apps/windows-agent.Tests/FieldChannelWireContractTests.cs`
- `docs/qa/FIELD_THREAT_MODEL.md`
- `docs/qa/ATOMIC_AUDIT_2026-07-25_FIELD_CHANNEL_CANONICAL_TIME.md`

## Identity, generation, and policy impact

- no Field identity or generation semantics changed;
- no policy scope was expanded;
- no model-facing authority was added;
- existing signed fixture timestamps already use the canonical representation, so the fixture signature is unchanged;
- alternate equivalent timestamp text is now denied rather than silently accepted.

## Questions and assumptions

- the wire format is UTC, exact millisecond precision, and terminal `Z`;
- sub-millisecond source values are normalized when locally creating a .NET envelope;
- raw wire parsing must call the canonical parser before constructing a .NET envelope;
- durable replay persistence and key rotation remain separate work under issue #22.

## Tests added or updated

TypeScript:

- canonical `Date` conversion;
- canonical schema acceptance;
- alternate offset and fractional representations denied;
- invalid calendar dates denied;
- noncanonical signed-envelope fields denied before signature verification;
- cross-language fixture remains valid.

.NET:

- exact formatter and parser agreement;
- alternate timestamp representations denied;
- local creation normalizes offset and sub-millisecond precision;
- verification rejects a noncanonical in-memory timestamp;
- cross-language fixture uses canonical raw-string parsing.

## Commands actually run

An isolated TypeScript syntax/type-shape check was run in the working container with the installed TypeScript 5.8 compiler and minimal declarations for unavailable dependencies:

```text
tsc --noEmit
```

Result: passed for the modified `fieldChannel.ts` source shape.

The full repository commands were not run because the private GitHub Actions jobs continue to receive no runner steps or logs, and the working container does not have the repository dependency tree or .NET SDK.

## Evidence class

- connector-backed source commits;
- static review;
- isolated TypeScript compiler check with dependency stubs;
- tests written but not executed through the repository runner;
- no .NET execution evidence;
- no Windows or Hyper-V evidence.

## Security and privacy impact

Positive:

- signed timestamp text now has one representation;
- semantically equivalent timestamp spellings cannot create cross-language signature disagreement;
- invalid or ambiguous time input fails closed;
- no recording, input, VM, credential, artifact, or personal-data surface changed.

Remaining:

- replay state remains in memory;
- live transport and serializer integration remain absent;
- exact-head execution is still required before this blocker can be marked resolved.

## Rollback

Revert the commits on `agent/github-completion-contract-hardening`. No runtime state, user data, VM, key, demonstration, or migration is created by this change.

## Next recommended slice

Implement bounded durable replay state with atomic persistence, exact Field generation and direction binding, key-ID binding, restart tests, corruption denial, and bounded .NET memory.