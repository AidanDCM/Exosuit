# Engineering Log — Complete Master Plan Reconciliation

**Date:** 2026-07-22  
**Subsystem ownership:** shared Glove and Field governance  
**Master-plan phases affected:** all; immediate gate remains L0  
**Branch:** `agent/field-foundation`

## Goal

Replace the stale pre-Field roadmap with one complete, authoritative plan that includes the full Glove/Field system and every stage required to teach, learn, validate, connect, package, and operate it.

## Problem found

The previous roadmap was broad but no longer represented the requested system accurately:

- it predated the full Field branch;
- it did not contain the complete Teach → Shadow → Correction → personal model → Assisted → Pilot program;
- it treated a browser semantic companion as a major planned execution phase even though the required product controls the entire desktop and treats the browser as a normal app;
- it did not map the current L0-L8 issue chain into the long-term production program;
- it did not separately plan task, attention, mouse, typing, language, timing, and correction models;
- it did not provide one complete definition of done for the finished personalized system.

## Changes

- replaced `docs/MASTER_SYSTEM_ROADMAP.md` with `Exosuit Complete Master System Plan`;
- defined the plan as the single planning authority;
- documented permanent Glove/Field separation;
- documented the normal-browser rule and removed browser-special execution from the required path;
- documented Field VM, storage, display, channel, scene, motor, Teach, data, learning, model, artifact, credential, recovery, audit, and manual architecture;
- documented Teach, Shadow, Correction, Assisted, and Pilot modes;
- documented separate task, attention, motor, typing, language, timing, correction, and verification models;
- documented the complete learning pipeline;
- documented phases L0 through L21;
- mapped issues #12-#19 to the appropriate phases;
- added exact testing, failure, evidence, rollback, promotion, production, and change-control requirements;
- added `scripts/validate-master-plan.mjs`;
- wired `npm run validate:plan` into Field and TypeScript validation;
- updated `AGENTS.md` to require the plan before changes;
- updated `README.md` to make the plan the repository entrypoint;
- added `docs/qa/MASTER_PLAN_COVERAGE_MATRIX.md`.

## Authority impact

No runtime authority changed. This is a governance and planning change.

The change strengthens authority boundaries by stating that:

- the model cannot administer Fields;
- a browser is an ordinary application;
- Teach and Shadow cannot execute;
- personal models cannot weaken policy, verification, audit, or stop;
- phase dependencies and evidence gates cannot be bypassed.

## Tests added or changed

Added static master-plan validation for:

- minimum plan size;
- required Glove/Field separation statement;
- browser rule;
- Field physical design;
- all operating modes;
- all behavioral model categories;
- all phases L0-L20;
- definitions of done;
- execution order;
- change control;
- absence of stale browser-companion roadmap language.

The validator is now called by:

- `npm run validate:plan`;
- `npm run validate:field`;
- `npm run validate:typescript`;
- the Windows evidence runner indirectly through TypeScript validation.

## Commands actually run

No repository commands were executed in this environment. GitHub source mutations were performed through the authenticated GitHub connector.

Executable evidence remains pending L0 on an authenticated checkout.

## Parts & Pieces application

Applied:

- one source of truth;
- question-everything reconciliation;
- phase gates;
- evidence-class separation;
- failure and rollback requirements;
- manualization;
- auditability;
- donor evidence not treated as project evidence.

## Security and privacy impact

Positive:

- recording and model-training stages now have explicit privacy gates;
- credential behavior is explicitly excluded from learning data;
- model deletion and derived-data deletion are planned;
- browser-special control is not a hidden alternative authority path;
- low-risk owner acceptance is separated from consequential tasks;
- production requires a security, privacy, and abuse review.

## Assumptions and unresolved areas

The plan deliberately records unresolved implementation choices, including final transport, visual capture rates, model architecture, training compute, credential broker, cockpit framework, and production support.

These are assigned to the first phase that depends on them rather than left as undocumented gaps.

## Rollback

Revert:

- the master roadmap replacement;
- README and AGENTS updates;
- `scripts/validate-master-plan.mjs`;
- `package.json` validation wiring;
- coverage matrix and this log.

Rollback is not recommended because the previous roadmap materially conflicted with the current product design.

## Next action

Run L0 on the exact branch head:

```powershell
./scripts/windows/Invoke-ExosuitFieldValidation.ps1
```

Repair only confirmed failures, update evidence, and keep PR #11 draft until the complete L0 gate passes.
