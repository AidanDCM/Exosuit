# Atomic audit: Field secret startup process harness

Date: 2026-08-01

Decision: PASS for Windows PowerShell subprocess evidence of launcher branch
ordering. DENY for live guest, LocalSystem, DPAPI/DACL, and production claims.

## Scope and authority

This shared Glove/Field-boundary slice changes only the Field guest launcher's
internal process-effect seams and test evidence. It does not change environment
authority, Glove policy, Field identity/generation rules, recording, transfer,
VM storage, or pilot authority. The pilot cannot configure or replace either
adapter.

## Evidence

The test creates a temporary source-derived copy of the production launcher,
replaces only the explicitly marked process adapters with inert functions, and
runs the remainder in a separate Windows PowerShell process. It proves:

- `converted` and `already_protected` exact receipts invoke protection then the
  guest emitter;
- a nonzero protection exit invokes protection only;
- malformed JSON invokes protection only;
- simulated protected publication followed by interruption/no receipt invokes
  protection only;
- each denial returns a nonzero launcher result.

The production launcher exposes no test argument, environment switch, alternate
agent path, or dynamic expression evaluation. Static tests retain exact receipt
schema, Field/generation/key/status/digest/freshness coverage.

## Failure and privacy boundary

No test fixture contains a channel secret, token, screenshot, UI text, or
demonstration data. The inert receipt contains only public test binding metadata
and a dummy digest. Session lock still stops in bootstrap before this
transaction. Secure Desktop, heartbeat loss, replay, overflow, uncertain action
effects, and emergency stop remain governed by their existing independent
boundaries; this slice neither handles nor weakens them.

This audit does not prove a real converter process, LocalSystem identity,
guest-machine DPAPI, DACL/TOCTOU behavior, physical seed retirement, heartbeat
publication/absence, restart after power loss, or a disposable guest lifecycle.

## Rollback

Revert the two internal adapter functions, restore direct process calls, remove
the subprocess harness, and revert the associated documentation. The protected-
only reader and fail-closed receipt validation remain independently required.
