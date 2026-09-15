# CHN-001 live timestamp compatibility

## Goal and gate

Accept the valid ISO 8601 `DateTimeOffset` representation emitted by the reviewed
PowerShell KVP observer. This is a shared CHN-001 acquisition-boundary correction for
the M1 channel promotion gate; it does not promote CHN-001 or alter Field authority.

## Change and impact

- Files changed: CHN-001 harness/schema tests, atomic audit, and failure matrix.
- Identity/generation and policy impact: none. Exact commit, machine, Field generation,
  VM GUID, channel key, nonce, sequence, payload hash, and evidence mode remain required.
- Parts & Pieces/donor patterns: none; the live Exosuit observer output is authoritative.
- Assumption: a syntactically valid offset datetime is equivalent input to its UTC `Z`
  representation. Imported ceremony times are still canonicalized before candidate output.
- Security/privacy: no secret or guest payload was added to source, tests, or logs.

## Validation and evidence boundary

The first authenticated v26 capture verified the channel but failed schema parsing because
its timestamps used `+00:00`. Regression coverage reproduces only that timestamp shape.
Run the focused CHN suite, typecheck, repository/plan/Field validators, then the complete
required validation commands after commit. This change is source/test evidence only until
the live capture succeeds; it does not establish any ceremony, stop, cleanup, or promotion.

## Rollback and next slice

Rollback is to revert this commit; the prior behavior fails closed on offset timestamps.
The next slice is to start a new exact-commit acquisition session, capture at least three
distinct authenticated heartbeats, and execute the separately authorized CHN ceremonies.

