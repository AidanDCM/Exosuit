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
- The first committed exact-head run reached the Field suite and failed one harness
  assertion because `spawnSync` returned without starting PowerShell under full-suite
  process pressure. No adapter call occurred, while five immediate focused repetitions
  passed 13/13. The harness previously treated a null process status as an expected
  product denial. It now retries only a pre-start infrastructure allocation failure,
  at most twice, and explicitly requires no spawn error. Once a child starts, its
  first result remains authoritative and is never retried.
- `npm run test:field -- --reporter=verbose` after that harness repair: 162/162
  passed under the full Field-suite load.

The exact-head evidence-preserving runner passed all 15 steps at
`1327e8572204e953e95e60b3a8b5a0954e4c2f97`; evidence is under
`artifacts/field-validation/20260803T152940Z`.

A reviewed self-contained agent and immutable base were built from that exact head.
The agent SHA-256 is
`54bf4030870f622be6042c216a472fe8934f53ee923a8bb086bbf6f0f72b8207`;
base `exosuit-field-base-v25` was sealed read-only at SHA-256
`5ec795fe378d256131e4e1c89c597a79a30e8923cafa3df6b793e7c125a2c744`.
Base-build and maintenance-cleanup receipts are under
`artifacts/local-live/base-v25/`.

Constrained owner policy `1ba343d4-171d-4996-b206-c4913ba2a860` provisioned
Field `c7dead44-f5e4-48c8-aa2d-a12a8902ea75`, generation 3. Initial observations
failed closed while first boot had not published a handshake. Exact-disk read-only
inspection showed the repaired agent and launcher, protected secret envelope, no
runtime error, and all ten pre-agent bootstrap checks passing. After exact restart,
observe job `7619475d-3810-4a99-b1bc-58ae7a6fe3f2` authenticated the handshake,
complete 12-check ready bootstrap, and ready heartbeat. Repeat job
`8b762b94-be82-4984-8c66-8f61f1b849d0` retained idempotent handshake/bootstrap
records while heartbeat wire sequence advanced from `1785773057626023` to
`1785773057626040`.

Destroy job `f917955c-37b6-411f-a04b-14a89d96aa6b` removed only the exact VM and
generation-3 root. Zero generation roots remained. Base v25 stayed read-only and
digest-identical. Local evidence is under
`artifacts/local-live/field-owner-l1/c7dead44-f5e4-48c8-aa2d-a12a8902ea75/generation-3/`.

## Security, privacy, assumptions, and unvalidated areas

The renamed value is a SHA-256 digest of the protected ciphertext envelope, not the
secret. No secret, screenshot, UI text, demonstration byte, host token, or Field
token is logged or committed. Deny-by-default receipt validation is retained. The
repaired receipt boundary is now proven on Windows LocalSystem and Hyper-V in a
development-access disposable generation. Session lock, Secure Desktop, heartbeat
loss, overflow, uncertain effects, emergency stop, owner-authorized rotation, and
production authentication remain unvalidated by this slice.

## Rollback and next slice

Revert the record-property rename and its tests to restore the previous safe
pre-emitter denial; retire v25 from local host configuration to disable this image.
Do not reuse or mutate v24. The next slice is the remaining L3 failure matrix:
locked session, Secure Desktop, heartbeat loss, crash/service recovery, and
production-authenticated replacement. No production promotion is claimed here.
