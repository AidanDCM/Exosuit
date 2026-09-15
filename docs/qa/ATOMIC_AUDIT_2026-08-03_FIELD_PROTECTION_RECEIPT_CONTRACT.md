# Atomic Audit — Field Protection Receipt Contract

**Date:** 2026-08-03
**Depth:** Level 4 authenticated guest startup
**Status:** development rebuilt-image live proof passed; production promotion denied
**Master-plan phase:** L2/L3

## Question

Can the protected-secret command and fixed guest launcher disagree about a
metadata receipt while isolated tests pass, causing the guest service to deny before
authenticated KVP publication without exposing the actual boundary mismatch?

## Evidence and verdict

Yes. The command emitted `protectedEnvelopeSha256`; the launcher accepted only
`ciphertextEnvelopeSha256`; and the PowerShell harness manually supplied the latter.
The observed v23/v24 state—protected envelope present, complete bootstrap report,
empty emitter error log, and no handshake—is consistent with rejection between
protection and emitter start. Verdict: **DENY live promotion; source defect repaired.**

The v25 generation-3 acceptance subsequently authenticated the exact handshake,
complete ready bootstrap, and ready heartbeat twice through the constrained owner
service. The second observation retained idempotent control records and advanced the
heartbeat sequence. Exact destruction removed the disposable generation while the
read-only base digest remained unchanged. Verdict: **PASS this development receipt
boundary; DENY production promotion pending the remaining L3 matrix.**

## Repair properties

- The compiled result now emits the launcher's exact six-property schema.
- A .NET test parses the serialized JSON and asserts every property name, digest,
  status, and absence of the obsolete spelling.
- A cross-layer source contract binds the compiled property, serializer assertion,
  and PowerShell launcher spelling.
- The Windows subprocess harness distinguishes failure to allocate its PowerShell
  test process from a product denial. Only a pre-start allocation failure is retried;
  a started product process is never retried.
- The receipt remains metadata-only. It carries no plaintext secret or UI data.
- Unknown, missing, duplicate, extra, stale, future, cross-Field, cross-generation,
  wrong-key, bad-status, and bad-digest receipts still stop before the emitter.

## Authority and failure boundaries

This does not enable input, recording, transfer, policy creation, key rotation,
attestation issuance, or MCP administration. It changes no host/guest identity or
storage binding. A malformed or incompatible receipt continues to fail closed. v24
remains immutable negative evidence; the separate v25 proof is recorded above.

## Remaining evidence

Exact-head source gates, reviewed immutable-base build, restart, authenticated
handshake/bootstrap/heartbeat, repeated observation, destruction confinement, and
unchanged base digest passed. Lock and Secure Desktop denial, heartbeat loss,
crash/service recovery, stale-generation replacement, rotation, and production
authentication remain required. Production remains denied.
