# Level 4 Addendum: Completion Evidence-Issuer Separation

**Date:** 2026-08-11

**Verdict:** pass; closes the key-level half of the approval-independence concern

## Safety question

Can the holder of an evidence-signing key approve the evidence it produced?

## Implemented controls

- A promotion into `passed` is rejected when `reviewerKeyId` equals the `signingKeyId` of any
  cited evidence record.
- The rule is bound to signing keys rather than `issuer` display strings. Both `issuer` fields
  are operator-chosen free text; a name comparison would be cosmetic. A test asserts explicitly
  that renaming the issuer does not satisfy the rule.
- The failure names the offending key and evidence id, so the reason is actionable rather than
  a bare rejection.
- A violation fails ledger verification, which makes the entire evaluation non-authoritative
  rather than emitting a warning that could be read past.

## Evidence and residual risk

Five focused tests. The frozen-contract fingerprint is unchanged, confirming this is verifier
logic and not a contract revision. The completion suite is 106/106 and `validate:completion` is
unchanged: CHN-001 `passed`, SCN-001 `source_validated`, promotion denied.

All eight historical promotions satisfy the rule, so nothing was revoked. That was a
requirement, not a happy accident: the rule was evaluated against real ledger data before being
written.

Residual: this closes one of three gaps. Reviewer-key custody (Gap 2) is untouched — the
approval key still carries no custody or TPM evidence — and remains a deliberate contract
revision because it adds schema fields. Operator co-location (Gap 3) is unchanged and
unclosable in software on a single account. Cryptographic role separation still is not operator
separation, and CHN-001 remains class B.

## Rollback

Remove the check and `tests/completionIssuerSeparation.test.ts`. No other code depends on it and
no evidence would change status.
