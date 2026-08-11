# Completion evidence-issuer separation (Gap 1)

- **Goal:** close Gap 1 from the approval-independence audit — enforce that an issuer may not
  approve its own evidence.
- **Master-plan phase/gate:** completion contract hardening. No gate is promoted, revoked, or
  re-run by this change.
- **Files changed:** `src/completion/ledger.ts`, `tests/completionIssuerSeparation.test.ts`,
  `docs/qa/COMPLETION_APPROVAL_INDEPENDENCE.md`, this log, a Level 4 atomic audit.

## The rule

A promotion into `passed` is rejected when `reviewerKeyId` equals the `signingKeyId` of any
cited evidence record.

It is bound to **keys**, not to `issuer` display strings. Both `issuer` fields are
operator-chosen free text, so a name comparison would let one actor pick `harness-a` and
`reviewer-b` and satisfy the rule while changing nothing about who actually produced and
approved the evidence. A signing key is the part an actor cannot choose without holding it.
There is a test named for exactly this: renaming the issuer does not satisfy the rule.

## Why this is additive rather than retroactive

The frozen surface reduces statuses, transitions, evidence classes and allowlists, weights,
scores, thresholds, freshness windows, approval authorities, and the *field lists* of the wire
schemas. This change adds no schema field and touches only verifier logic, so the fingerprint
does not move and no re-attestation is owed.

All eight historical promotions were checked against the rule before it was written and again
after: reviewer key `live-technical-review-1` throughout, evidence signed by `live-evidence-1`
or `live-host-1`. Zero violations. CHN-001 remains `passed` and nothing was revoked, which was
the explicit requirement.

- **Identity/generation/policy impact:** none. No new authority, no schema change, no key
  change.
- **Tests:** 5 new — the rule does not fire on real data, it holds for every promotion rather
  than only the latest, it rejects a promotion whose approval key signed the cited evidence, it
  names the offending key and evidence so the reason is actionable, and it is not satisfied by
  renaming the issuer.
- **Commands actually run:** `npm run typecheck`, `npm run test:completion`, the frozen-contract
  test, `npm run validate:completion`, `npm run validate:repository`.
- **Results/evidence:** typecheck passed. Frozen-contract test 4/4 — **fingerprint unchanged**.
  Completion suite 106/106. New issuer-separation suite 5/5. `validate:completion` unchanged:
  CHN-001 `passed`, SCN-001 `source_validated`, next phase M2, promotion denied. Repository
  validation 88 artifacts.
- **Residual limitation:** this closes the *key-level* half of the concern. Gap 2 (reviewer-key
  custody) and Gap 3 (operator co-location) are untouched and remain open exactly as recorded.
  Cryptographic role separation still is not operator separation.
- **Security/privacy:** no new surface.
- **Failure behavior:** a violating promotion fails ledger verification, which makes the whole
  evaluation non-authoritative rather than merely warning.
- **Rollback:** remove the check and its test file. Nothing else depends on it.
- **Next:** Gap 2 remains a deliberate contract revision with re-attestation consequences and is
  not bundled into unrelated work.
