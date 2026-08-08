# Atomic audit: Field channel-key rotation foundation

## Verdict

PASS for a source-only, fake-provider transactional foundation. Live key
storage, host/guest rotation, owner UI, MCP exposure, production use, and
promotion remain DENIED.

## Authority and identity

- Operation: `rotate_channel_key`
- Permitted actor: `owner_local` only
- Required: authenticated local transport and interactive owner presence
- Binding: one rotation/request ID, exact Field ID/generation, current key ID,
  distinct next key ID, and five-minute authorization freshness
- Explicitly blocked: `pilot_model`, `field_service`, remote requests, absent
  owner, stale/future requests, detached authorization, replayed rotation ID,
  stale current key, and cross-generation requests

## Transaction and failure behavior

The provider receives an opaque secret handle but no secret is accepted into
coordinator state, result, or audit-shaped output. Prepare must return an exact,
fresh receipt with guest acknowledgment. Commit changes local active-key
authority only after an exact fresh receipt proves the requested next key.

Any prepare/commit/receipt failure reconciles before continuation:

- prior active: retain prior key;
- next prepared: roll back and require proof the prior key is restored;
- next active: adopt only the exact requested next key;
- unknown, failed reconciliation, or failed rollback: trust neither key and
  block all acceptance pending local owner reconciliation.

Provider error text is redacted from results because it could contain secret
material. Hydrated state rejects duplicate rotation IDs, cross-Field last
results, inconsistent blocked status, or disagreement about the active key.

## Evidence

Focused TypeScript tests cover successful commit, fake-provider state restore,
old-key rejection through the existing replay guard, model/service/owner and
transport denials, stale/detached/cross-generation/current/same-key/replay
denials, prepared rollback, proven-next reconciliation, unknown/rollback-failed
blocking, provider-error redaction, and inconsistent hydration.

## Privacy and capability boundary

No real key, secret byte, Windows credential, guest change, VM operation,
recording, input, screenshot, artifact transfer, policy expansion, or MCP tool
is added. The opaque handle is provider input and is deliberately absent from
exported coordinator state and results.

## Held gates

Protected Windows key storage, authenticated guest prepare/commit/rollback,
atomic durable coordinator persistence, crash/power-loss reconciliation,
mid-flight old/new traffic, key overlap policy, service restart, owner-visible
confirmation, revocation/deletion, live failure injection, and production
acceptance remain unproven.
