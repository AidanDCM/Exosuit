# Field protection receipt contract repair

**Date:** 2026-08-03

## Goal and promotion gate

Repair the first proven L3 guest-startup failure after protected channel-secret
conversion. This is Field-owned Phase L2/L3 startup and authenticated-channel work.
No promotion is claimed until a new immutable base and fresh disposable generation
publish and authenticate the exact handshake, bootstrap, and heartbeat sequence.

## Finding and change

The compiled protection command serialized the digest property as
`protectedEnvelopeSha256`, while `Start-ExosuitFieldGuest.ps1` required the exact
receipt property `ciphertextEnvelopeSha256`. The Windows harness supplied a
hand-authored receipt using the launcher's spelling, so it did not exercise the
compiled serialization contract.

This explains the live evidence without inferring readiness: v23/v24 converted the
seed to a protected envelope, produced an empty child runtime error log and an
all-pass bootstrap report, but never published `Exosuit.Field.Handshake`. The
launcher rejected the receipt schema before starting the emitter. The current v24
owner-service generation repeated the same missing-handshake result sixty times.

The conversion result now names and serializes the metadata-only field as
`ciphertextEnvelopeSha256`. The .NET serialization test requires the complete exact
six-property receipt schema and rejects the old spelling. The cross-layer Windows
script test requires the compiled record, launcher, and serialization assertion to
use the same field.

## Ownership, identity, policy, and Parts & Pieces

Field guest startup owns this change. It does not alter Glove authority, Field ID or
generation semantics, policy, consent, attestation, keys, recording, transfer,
input, emergency stop, or MCP. The pilot/model cannot select receipt properties or
expand policy. Every eventual message remains bound to the exact Field, generation,
agent, key, direction, sequence, nonce, and expiry.

Parts & Pieces patterns considered were an explicit cross-process receipt contract,
metadata-only status, fail-before-emitter behavior, exact schema validation, and
fresh-generation proof. No donor code or donor tests are used as Exosuit evidence.

## Tests and evidence

Commands actually run:

- PATH `dotnet test ...`: did not run because the PATH-resolved host contains no SDK;
  this is recorded as an environment-selection failure, not a test result.
- `C:\Users\Aidan\.dotnet\dotnet.exe test ... --filter` for the converter and
  protection-command suites: 12/12 passed.
- `npm test -- --run tests/windowsFieldScripts.test.ts --reporter=verbose`: 13/13
  passed, including the exact cross-layer digest-field assertion and startup harness.

Repository/full/exact-head gates and live rebuilt-image evidence remain pending at
the time of this entry and must be appended only after they actually run.

## Security, privacy, assumptions, and unvalidated areas

The renamed value is a SHA-256 digest of the protected ciphertext envelope, not the
secret. No secret, screenshot, UI text, demonstration byte, host token, or Field
token is logged or committed. Deny-by-default receipt validation is retained. The
causal conclusion is strongly supported by exact source/evidence agreement, but a
new guest image is still required to prove it on Windows LocalSystem and Hyper-V.
Session lock, Secure Desktop, heartbeat loss, replay, overflow, uncertain effects,
emergency stop, rotation, and production authentication remain unvalidated here.

## Rollback and next slice

Revert the record-property rename and its tests to restore the previous safe
pre-emitter denial. Do not reuse or mutate v24. After exact-head validation, build a
new immutable base from the reviewed commit, then provision a new disposable Field
generation and require authenticated provisioning, ready transition, restart, exact
destruction, and unchanged base digest before promotion.

