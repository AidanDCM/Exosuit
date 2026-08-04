# Persona and behavioral dynamics foundation

## Goal

Add the first bounded source implementation for persistent persona traits, contextual behavioral state, thinking time, verification intensity, low-risk observed imperfection allowances, profile integrity, and drift review.

## Files changed

- `src/personaBehavior.ts`
- `tests/personaBehavior.test.ts`
- `package.json`
- `docs/PERSONA_BEHAVIORAL_DYNAMICS.md`
- `docs/qa/ATOMIC_AUDIT_2026-08-03_PERSONA_BEHAVIOR_FOUNDATION.md`
- this engineering log

## Architecture

The persona layer is advisory and non-executing.

It accepts:

- one integrity-valid persona profile;
- current operating mode;
- task stage;
- declared risk;
- complexity, familiarity, uncertainty, urgency, and target difficulty;
- system readiness;
- sensitive-effect flags;
- one deterministic audit seed.

It returns:

- effective risk;
- behavioral state;
- bounded thinking delay;
- motor-speed preference;
- verification intensity;
- abstention and owner-review requirements;
- disclosure requirement;
- strictly bounded imperfection eligibility;
- reasons;
- `actionAuthority: none`.

The output cannot execute an action or authorize a denied action.

## Safety decisions

- Imperfection strategy is fixed to `observed_distribution_only`.
- Purpose is fixed to `personalization_not_evasion`.
- No more than one imperfection may be eligible per action chunk.
- Immediate correction is mandatory.
- Review and commit stages suppress imperfections.
- Medium-or-greater risk is suppressed by the default profile policy.
- Identity-sensitive, external, financial, legal, destructive, and human-verification contexts suppress imperfections.
- External, financial, legal, destructive, and human-verification contexts escalate to consequential risk.
- Human verification and extreme uncertainty force abstention.
- Assisted and Pilot planning require an owner-approved profile.
- The source module contains no mouse, keyboard, process, network, shell, or Field-administration route.

## Profile integrity and drift

Profiles are hashed using canonical SHA-256 and versioned consecutively.

Drift comparison rejects cross-owner, cross-profile, and nonconsecutive comparisons. Material trait changes, timing changes above 50%, and removed habits are flagged for owner approval.

## Tests written

Focused tests cover:

- profile integrity and tamper detection;
- deterministic behavior plans;
- low-risk drafting eligibility;
- consequential-risk suppression;
- risk-sensitive thinking and verification;
- unavailable-desktop and human-verification abstention;
- owner-approved Assisted/Pilot requirement;
- drift and version enforcement;
- rejection of excessive or evasion-oriented imperfection policy.

## Validation performed in this pass

The new TypeScript source and test files were assembled and checked for TypeScript syntax and internal type shape in an isolated local scratch configuration.

The actual Exosuit repository dependencies, Vitest suite, build, system pulses, .NET tests, PowerShell checks, and clean-checkout parity were not executed through this connector session. No repository pass is claimed.

## Evidence boundary

This is a source foundation, not a trained personality model. It does not prove owner similarity, live behavior, actual correction generation, encrypted persistence, owner controls, Assisted Mode, Pilot Mode, ChatGPT operation, or production readiness.

## Rollback

Revert this slice. It has no database migration, VM state, credential state, recording state, model state, or live execution authority.

## Next recommended slice

Run exact-head repository validation. After that, add integrity-protected encrypted persona-profile persistence with owner-controlled promotion, disable, rollback, and deletion before connecting the profile to any live Glove motor or language path.
