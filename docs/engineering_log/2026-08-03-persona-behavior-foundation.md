# Persona and behavioral dynamics foundation

## Goal

Add the first bounded implementation for persistent persona traits, contextual behavioral state, thinking time, verification intensity, low-risk observed imperfection allowances, profile integrity, and drift review.

## Files changed

- `src/personaBehavior.ts`
- `tests/personaBehavior.test.ts`
- `package.json`
- `package-lock.json`
- `.github/workflows/ci.yml`
- `docs/PERSONA_BEHAVIORAL_DYNAMICS.md`
- `docs/qa/ATOMIC_AUDIT_2026-08-03_PERSONA_BEHAVIOR_FOUNDATION.md`
- this engineering log

## Architecture

The persona layer is advisory and non-executing.

It accepts an integrity-valid persona profile plus operating mode, task stage, declared risk, complexity, familiarity, uncertainty, urgency, target difficulty, readiness, sensitive-effect flags, and a deterministic audit seed.

It returns effective risk, behavioral state, thinking delay, motor-speed preference, verification intensity, abstention/review/disclosure requirements, bounded imperfection eligibility, reasons, and:

```text
actionAuthority: none
```

The output cannot execute or authorize an action.

## Safety decisions

- Imperfection strategy is fixed to `observed_distribution_only`.
- Purpose is fixed to `personalization_not_evasion`.
- No more than one imperfection may be eligible per action chunk.
- Immediate correction is mandatory.
- Review and commit stages suppress imperfections.
- Default medium-or-greater risk suppresses imperfections.
- Identity-sensitive, external, financial, legal, destructive, and human-verification contexts suppress imperfections.
- External, financial, legal, destructive, and human-verification effects escalate to consequential risk.
- Human verification and extreme uncertainty force abstention.
- Assisted and Pilot planning require an owner-approved profile.
- The module contains no mouse, keyboard, process, network, shell, credential, approval, or Field-administration route.

## Profile integrity and drift

Profiles use canonical SHA-256 and consecutive versions. Drift comparison rejects cross-owner, cross-profile, and nonconsecutive comparisons. Material trait changes, timing changes above 50%, and removed habits require owner review.

## Tests

Eight focused persona tests cover:

- profile integrity and tamper detection;
- deterministic non-executing plans;
- low-risk drafting eligibility;
- consequential-risk suppression;
- risk-sensitive thinking and verification;
- unavailable-desktop and human-verification abstention;
- owner-approved Assisted/Pilot planning requirement;
- drift/version enforcement and rejection of excessive or evasion-oriented policy.

## Hosted validation

Implementation baseline: `e91707dff2cc3c1767a63f8f076e71bba957a6f9`  
Exosuit CI: `30868262475`  
Security Audit: `30868262468`

Results:

- GitHub-hosted Ubuntu and Windows runners executed normally;
- workflow permissions were read-only;
- committed cross-platform lockfile installed with immutable `npm ci`;
- dependency install/audit found zero npm vulnerabilities;
- repository, master-plan, and Field validators passed;
- strict TypeScript typecheck passed;
- focused Field suite passed: 31 files, 150 tests;
- all eight persona tests passed;
- Field pulse passed;
- full TypeScript suite passed: 63 files, 322 tests;
- TypeScript build and Glove pulse passed;
- PowerShell parsing passed;
- .NET Release build passed with zero warnings and errors;
- .NET suite passed: 48 tests;
- npm and NuGet security-audit jobs passed;
- CodeQL was skipped under the private-repository condition and is not claimed as passing.

## CI defects discovered and repaired

Hosted execution exposed two broader repository defects:

1. piped CI commands lacked explicit `pipefail`, allowing a failed command before `tee` to look successful;
2. the Windows-generated lockfile omitted Linux-native Rollup and esbuild packages.

The workflow now fails piped commands honestly, uses a committed cross-platform lockfile, restores read-only permissions, and installs only with `npm ci`.

The manual secret scan also excluded one exact negative-test fixture, `supportBundle.test.ts`, because it intentionally contains synthetic secret shapes. All other non-Markdown source/config scanning remains active.

## Evidence boundary

This is a validated source and unit/integration foundation, not a trained personality model. It does not prove owner similarity, live behavior, actual correction generation, encrypted persona persistence, owner controls, Assisted Mode, Pilot Mode, ChatGPT operation, or production readiness.

## Rollback

Revert this slice. It creates no VM, credential, recording, trained-model, database, or live execution state.

## Next recommended slice

Add integrity-protected encrypted persona-profile persistence with owner-controlled promotion, disable, rollback, and deletion before connecting the profile to any live Glove motor or language path.
