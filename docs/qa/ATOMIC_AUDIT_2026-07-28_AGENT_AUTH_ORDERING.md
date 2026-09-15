# Level 4 addendum: agent-channel authentication ordering

**Date:** 2026-07-28
**Subsystem:** shared Glove supervisor authentication boundary
**Capability change:** diagnostic ordering only; no new authority or transport

## Atomic unit

`AgentChannelAuthenticator` verifies signed agent registrations and heartbeats before they can affect supervisor identity, health, capabilities, selection, or replay state.

## Threat and failure analysis

Previously a schema-valid unauthenticated packet was checked for clock skew, and a registration was checked for contract-range ordering, before its HMAC was verified. This exposed low-value validity diagnostics to an unauthenticated caller. Contract-range validation also lived outside the common verification function, making it easier for later message types to drift in ordering.

Required invariant:

```text
strict structural parse
-> signature verification
-> authenticated timestamp checks
-> authenticated message-specific semantics
-> replay lookup and atomic acceptance
```

Structural parsing remains first because a bounded typed object is required to calculate the canonical HMAC safely. Structural parse errors are not runtime-state diagnostics. No nonce is pruned, checked, or stored before authentication and semantic acceptance.

## Questions considered

- Could a tampered stale packet reveal clock skew? No; it now fails at signature verification.
- Could a tampered invalid contract range reveal semantic validity? No; it now fails at signature verification.
- Could a correctly signed but semantically invalid registration burn a nonce? No; the semantic callback runs before replay lookup/storage.
- Could pruning before authentication allow an attacker to mutate state? Pruning was moved after authenticated semantic validation.
- Did the change weaken replay or domain separation? No; replay keys and explicit registration/heartbeat HMAC domains are unchanged.

## Evidence

- focused tests cover unauthenticated stale and invalid-range packets;
- focused tests reuse the nonce after authenticated semantic rejection;
- existing signature, skew, replay, heartbeat, and domain-separation tests remain required;
- full TypeScript, build, system-pulse, and .NET gates are required before publication.

## Residual risk

- strict schema parse errors remain distinguishable from signature errors;
- the shared secret is still software-managed;
- key rotation and an independently reviewed live transport remain production requirements.

## Rollback

Revert the authentication-ordering commit. Runtime disable remains supervisor/agent-channel shutdown; no feature flag is needed because the slice grants no capability.

