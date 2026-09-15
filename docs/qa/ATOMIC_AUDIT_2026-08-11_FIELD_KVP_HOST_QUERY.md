# Level 4 Addendum: Host Guest-KVP Query

**Date:** 2026-08-11

**Verdict:** pass for name constraint and failure attribution; no real implementation exists
behind it

## Safety question

Can the host read the wrong VM, or attribute a host-side fault to the guest?

## Implemented controls

- **Wrong-VM risk is treated as first-class.** Reading the wrong VM produces a perfectly
  authentic snapshot — correct signatures, correct digests, valid envelope — from the wrong
  Field, and no downstream check would catch it. The reader is injected so this decision sits in
  code that can be exercised without a hypervisor, and a test pins that the exact VM name is
  passed through.
- **VM names are constrained rather than escaped.** The name reaches PowerShell and CIM filters;
  escaping is a property of every call site and must be got right repeatedly, while a whitelist
  is a property of the value and is got right once. Ten hostile shapes are rejected, including
  quote-breaking, subshell, newline, and pipe forms.
- **The check runs before the hypervisor is called.** A test asserts the reader is never invoked
  for a rejected name.
- **A failed read is not an empty exchange.** Returning an empty snapshot on a hypervisor error
  would let a host fault read as "the guest published nothing", which the monitor treats as a
  scene that has gone away — an invalidation attributed to the guest for a host-side problem.
  Separate results, with a test pinning the distinction.
- **Parse failures do not fail the read.** One malformed item cannot blank a usable snapshot, and
  the failures travel alongside so they cannot be lost either.

## Evidence and residual risk

Eight tests; typecheck, build, and both validators pass.

Unproven, and the gap is now the whole remaining question: **no `GuestExchangeReader`
implementation exists.** Nothing has queried real Hyper-V. The host read path is complete in
shape — query, parse, reassemble, authenticate, fold into readiness — and entirely unexercised
against a live guest. Every agreement between the pieces rests on construction and on matching
the existing PowerShell script, not on an end-to-end run. SCN-001 remains `source_validated`.

## Rollback

Delete the module and its tests. Nothing depends on it.
