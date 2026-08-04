# Atomic audit: Persona and behavioral dynamics foundation

- **Date:** 2026-08-03
- **Branch:** `codex/unify-glove-field`
- **Scope:** persona profile, contextual behavior plan, bounded imperfection policy, and drift report
- **Verdict:** source foundation added; exact-head repository execution pending

## 1. Security boundary

The new module has no direct action authority.

Required invariant:

```text
actionAuthority: none
```

The module imports only Zod validation and canonical hashing. It does not import or expose:

- mouse or keyboard execution;
- process execution;
- network transport;
- Field administration;
- credential access;
- approval mutation;
- consent creation;
- emergency-stop mutation.

## 2. Owner authority

- Approved persona state requires explicit owner approval.
- Assisted and Pilot behavior planning reject unapproved profiles.
- Persona versions advance consecutively.
- Profile changes invalidate the canonical hash.
- Material drift is surfaced for owner review.
- Owner identity and profile identity cannot be crossed during drift comparison.

## 3. Imperfection boundary

The profile schema fixes:

```text
strategy: observed_distribution_only
purpose: personalization_not_evasion
immediateCorrectionRequired: true
```

Probability ceilings:

- draft typo: `<= 0.15`;
- draft misclick: `<= 0.05`;
- imperfections per action chunk: `<= 1`.

Eligibility is suppressed during:

- review and commit stages;
- configured medium-or-greater risk;
- identity-sensitive communication;
- external commitment;
- financial or legal effect;
- destructive effect;
- human-verification requirements;
- unavailable system state;
- abstention;
- Teach and Correction capture.

The module does not generate a typo or misclick. It returns eligibility and ceilings only.

## 4. Risk and abstention

The module may raise but never lower declared risk.

It escalates external commitments, financial/legal effects, destructive effects, and mandatory human verification to consequential risk.

It abstains for:

- desktop not ready;
- mandatory human verification;
- uncertainty at or above `0.95`.

## 5. Determinism and auditability

Thinking-time variation is deterministic from:

```text
profileHash + deterministicSeed + contextId
```

The same valid profile and context produce the same plan. This supports repeatable tests and audit. It is not used as a security secret.

## 6. Tests written

`tests/personaBehavior.test.ts` includes coverage for:

1. profile hashing and tamper detection;
2. deterministic plans;
3. non-executing action authority;
4. low-risk drafting eligibility;
5. high/consequential suppression;
6. risk-sensitive timing and verification;
7. unavailable-system and human-verification abstention;
8. owner approval for Assisted/Pilot planning;
9. profile drift and version sequencing;
10. rejection of evasion-oriented purpose and excessive rates.

## 7. Required executable evidence

Before this slice may be labeled executable-validated, run on the exact current head:

```bash
npm ci --ignore-scripts --fund=false
npm run validate:repository
npm run validate:plan
npm run validate:field-contract
npm run typecheck
npm run test:persona -- --reporter=verbose
npm run test:field -- --reporter=verbose
npm test -- --reporter=verbose
npm run build
npm run test:pulse -- --reporter=verbose
npm run test:field-pulse -- --reporter=verbose
npm run agent:test
```

The standard Windows L0 evidence runner remains the preferred complete path.

## 8. Unproven areas

- real demonstration-derived persona values;
- encrypted persona persistence;
- owner editor and promotion workflow;
- profile rollback and deletion in a running product;
- held-out personality consistency;
- actual typing-process model;
- actual motor-correction model;
- live Glove integration;
- Shadow calibration;
- Assisted or Pilot acceptance;
- ChatGPT acceptance;
- production readiness.

## 9. Promotion posture

- source review: open;
- exact-head test status: pending;
- live integration: denied;
- personal-model production gate: denied;
- Assisted/Pilot gate: denied;
- production: denied.
