# Atomic Audit — Field Protection Receipt Contract

**Date:** 2026-08-03  
**Depth:** Level 4 authenticated guest startup  
**Status:** source repair; rebuilt-image live proof pending  
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

## Repair properties

- The compiled result now emits the launcher's exact six-property schema.
- A .NET test parses the serialized JSON and asserts every property name, digest,
  status, and absence of the obsolete spelling.
- A cross-layer source contract binds the compiled property, serializer assertion,
  and PowerShell launcher spelling.
- The receipt remains metadata-only. It carries no plaintext secret or UI data.
- Unknown, missing, duplicate, extra, stale, future, cross-Field, cross-generation,
  wrong-key, bad-status, and bad-digest receipts still stop before the emitter.

## Authority and failure boundaries

This does not enable input, recording, transfer, policy creation, key rotation,
attestation issuance, or MCP administration. It changes no host/guest identity or
storage binding. A malformed or incompatible receipt continues to fail closed. A
new image and generation are mandatory; v24 remains immutable negative evidence.

## Required closure evidence

Focused and exact-head source gates must pass, followed by a reviewed immutable-base
build and fresh-generation Hyper-V proof of authenticated handshake, bootstrap,
heartbeat, lock/Secure Desktop denial, restart behavior, destruction confinement,
and unchanged base digest. Until then production remains denied.

