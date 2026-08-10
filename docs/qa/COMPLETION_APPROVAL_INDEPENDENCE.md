# Completion approval independence — classification and hardening scope

Status: accepted weakness for the personal-MVP target. Recorded 2026-08-10.
Applies to the frozen completion contract v2.3, fingerprint
`2d16a0c5bba40a424b001b770ef8988a0b178d764ba53e3606ecc11c1d322f67`.

This document exists because "independent review" is not one guarantee. It is three, and
Exosuit currently holds two of them. Conflating them would let a gate claim more assurance
than it has.

## The three guarantees

| Layer | Question it answers | Held today |
|---|---|---|
| **Role separation** | Was the approval signed by a key authorised for the required approval role, distinct from the key that sealed the transition? | **Yes**, enforced |
| **Custody separation** | Was that approval key provably protected — TPM-backed, non-exportable — at the moment it signed? | **No** |
| **Operator separation** | Did a second principal, outside the automation's reach, choose to approve? | **No** |

## Classification scale

- **Class A** — reviewer key held in a separate trust boundary (another device, account, or
  hardware token), or an interactive approval the automation cannot invoke itself.
  Required for production and for owner-acceptance gates.
- **Class B** — cryptographically separate, role-bound approval key; same machine and same
  operator custody. Acceptable for the personal-MVP target only.
- **Class C** — approval asserted by name or reason text without an independent signature.
  Never acceptable.

**CHN-001 is class B.** So are SRC-001, SRC-002, SRC-003, and HYP-001.

## What the contract already enforces

For any transition into `passed`, [`src/completion/ledger.ts`](../../src/completion/ledger.ts)
requires all of:

- an explicit `reviewer`, distinct from `issuer`;
- `reviewerKeyId !== signingKeyId` — the approval key may not be the sealing key;
- `reviewerRole` equal to `requiredApprovalRole(testId)`;
- a valid Ed25519 `reviewerSignature`, verified in
  [`src/completion/signing.ts`](../../src/completion/signing.ts) against the registered
  public key, which must itself hold the claimed role and pass revocation, validity-window,
  registry-purpose, and machine-binding checks;
- at least one cited evidence record, bound to the same test and observed no later than the
  transition.

The issuer signature covers `reviewerSignature`, so an approval cannot be altered after it
is given. The live registry is single-role per key, so the ledger key cannot mint a review.

This is real. It defeats the obvious forgery — a ledger-key holder naming an arbitrary
reviewer — and it is why class B is not class C.

## Gap 1 — evidence-issuer separation

**Problem.** No check compares a cited evidence record's authorship to the approving
principal. The enforced separation is between the *ledger sealer* and the *reviewer*, never
between the *evidence producer* and the reviewer. The stated rule "issuer must not approve
its own evidence" is therefore weaker in code than on paper.

**Required shape of the fix.** Bind keys, not names. Evidence records already carry
`signingKeyId`, so the rule is expressible today:

> A promotion into `passed` is rejected if `reviewerKeyId` equals the `signingKeyId` of any
> cited evidence record.

A comparison of `issuer` against `reviewer` display strings would be cosmetic: both are
operator-chosen free text, so the same actor can pick `harness-a` and `reviewer-b` and
satisfy it while changing nothing. Any future principal-level rule must resolve to a stable
authenticated identity or a signing-key binding.

**Frozen-surface impact: none.** The frozen fingerprint reduces statuses, transitions,
evidence classes and allowlists, weights, scores, benchmark thresholds, freshness windows,
approval authorities, and the *field lists* of the wire schemas. Verifier logic is not part
of it. This fix adds no schema field.

**Retroactive impact: none.** The rule was evaluated against all eight historical
promotions; every one already satisfies it (reviewer `live-technical-review-1`; evidence
signed by `live-evidence-1` or `live-host-1`). Zero violations. Adding it revokes nothing.

**Priority.** Before the next high-consequence gate. Not urgent for SCN-001 source work.

## Gap 2 — reviewer-key custody

**Problem.** Custody binding, protection backend, and TPM participation are recorded for the
sealing key only — the CHN-001 event carries `keyCustodyEventId: custody-live-ledger-1-…`,
`keyProtectionBackend: tpm`, and a `tpmProofId` that all describe `live-ledger-1`.
`reviewerKeyId` flows into no custody or TPM check, and `live-technical-review-1` has no
events in `key-custody.json` at all. The contract proves the approval key is registered and
unrevoked; it does not prove the key was loaded through a permitted TPM-backed path when it
signed.

**Required shape of the fix.** Reviewer signatures should carry the same class of custody
evidence demanded of other live signing authority — at minimum a custody event id and
protection backend for the approval key, bound into the signed event.

**Frozen-surface impact: yes.** This adds fields to `completionLedgerEventV23Schema`, whose
field list is part of the fingerprint. It is a deliberate contract revision: bump
`FROZEN_CONTRACT_LABEL`, state why, move the pin, and re-attest anything that depended on
the old surface. It must not be slipped in as an incidental edit.

**Retroactive impact.** Existing promotions predate the field and remain valid under the
contract that existed when they were made. Do not backfill or synthesize custody events for
past approvals.

**Priority.** Soon, but scheduled as a contract revision with its re-attestation cost
budgeted — not folded into an unrelated slice.

## Gap 3 — operator separation (the ceiling)

One unattended command on one Windows account can produce both signatures: all live keys
live in `C:\Users\Aidan\.exosuit-live-keys`, and the promotion CLI selects the approval
private key by role when `--reviewer-key` is omitted.

This is not fixable in software on a single account, and no amount of key hygiene changes
it. For the personal-MVP target it is **documented and accepted**. For production, or for
any gate requiring `owner_acceptance` or `release_approval`, it must be closed by moving the
reviewer key to a separate trust boundary — another device, account, or hardware token — or
by an interactive approval mechanism the automation cannot invoke on its own behalf.

Do not describe class B promotions as "independently reviewed" without qualification. They
are independently *signed*. That is a smaller claim, and it is the true one.
