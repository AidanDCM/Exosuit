# Atomic audit: protected KVP observation state

## Verdict

PASS for the bounded source/unit integrity slice. Live Field validation,
production key storage, key rotation, and promotion remain DENIED.

## Atomic unit and authority

The unit is the host-side compiled KVP observation-state persistence boundary.
It is Field-owned and does not alter Glove execution authority. The pilot and
model receive no method to create keys, rotate keys, migrate state, change Field
generation, or accept a failed ledger.

## Security properties

- State is written atomically in an HMAC-SHA256 envelope.
- Authentication covers a domain separator, exact Field ID/generation, key ID,
  algorithm, and serialized ledger payload.
- The tag is compared in fixed time before payload deserialization.
- File and encoded-payload sizes are bounded before decoding.
- Corruption, key substitution, generation substitution, malformed encoding,
  and legacy plaintext state fail closed.
- Rejection does not rewrite, delete, quarantine, or silently reset prior state.
- The envelope contains no channel secret, raw UI text, screenshots, recording
  bytes, tokens, or other private desktop content.

## Failure and recovery boundary

This slice deliberately does not implement automatic recovery. A changed key or
generation requires a separately reviewed local owner/service operation and a
new compatible state lifecycle. The verifier refuses old state instead of
guessing whether rotation or replacement was intended.

## Evidence and limitations

Focused `FieldKvpRuntimeTests` pass 5/5, covering exact retained reads, sequence
advance, mutation/reuse rejection, authenticated-state corruption, key change,
generation change, malformed state, and byte-identical rejection behavior.
This is source/unit evidence. No published agent, Hyper-V generation, protected
key store, rotation ceremony, or live fault injection is claimed by this audit.

## Rollback

Revert the protected-envelope source and test changes. That restores plaintext
structural validation and removes cryptographic at-rest integrity, so rollback
must not be used for a promoted channel.
