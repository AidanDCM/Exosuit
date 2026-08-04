# Persona operational foundations build-out

## Goal

Complete the maximum responsible repository-side implementation for persistent personal behavior before live Windows/Hyper-V evidence is available.

## Added

### Durable owner-governed state

- encrypted persona profile versions;
- owner-only approve/retire/revoke/rollback/delete transitions;
- hash-chained governance records;
- encrypted governance journal;
- privacy-preserving deletion certificates;
- encrypted typing, motor, language, attention, bundle, and activation records.

### Evidence-backed learning

- deterministic persona candidate derivation from successful processed demonstrations;
- explicit provenance and confidence per trait;
- explicit habit-feature evidence requirements;
- owner-reviewed promotion into evaluating profiles;
- held-out trait, timing, and habit stability evaluation;
- separate observed typing, motor, language, attention, and verification models.

### Runtime boundaries

- integrity-bound advisory model bundles;
- interactive owner activation, deactivation, and rollback;
- prediction-only Shadow capability and no-forward/no-input receipts;
- expiring Field/scene/policy/profile-bound Assisted proposals;
- local owner review envelopes with downstream re-observation and per-step reauthorization requirements;
- single-use, exact-scope opaque credential authorization handles with no secret material.

### Release support

- deterministic CycloneDX 1.5 npm SBOM generator;
- registry URL exclusion;
- fixed commit and dependency-set metadata support;
- focused tests and lifecycle documentation.

## Deliberate non-features

This pass does not:

- connect models directly to mouse or keyboard execution;
- generate human mistakes;
- claim human authorship;
- permit consequential Assisted proposals;
- solve human-verification challenges;
- include secret material in broker decisions;
- lower deterministic verification;
- activate models without the interactive local owner;
- claim production readiness.

## Evidence-driven repairs

Hosted validation exposed two defects and both were repaired before the final rerun:

1. trait overrides used a complete-record schema instead of a partial owner override;
2. encrypted model-save methods could throw synchronously despite a Promise-returning API.

No test or authority boundary was weakened to obtain a passing result.

## Validation state

Implementation head: `003a277fbfd040fbb05e690624969c504351cc7b`

- Exosuit CI run `30914537522`: passed;
- Security Audit run `30914537623`: supported jobs passed;
- repository validator: 90 artifacts;
- master-plan validator: all 22 sections;
- Field validator: 103 artifacts and 37 source modules;
- focused suite: 39 files, 194 tests;
- full TypeScript suite: 72 files, 366 tests;
- Glove and Field system pulses: passed;
- TypeScript typecheck and production build: passed;
- PowerShell parsing: passed;
- .NET Release build: 0 warnings, 0 errors;
- .NET tests: 48 passed, 0 failed, 0 skipped;
- deterministic npm SBOM: 141 components;
- npm audit: 0 vulnerabilities;
- NuGet direct/transitive audit: no vulnerable packages.

CodeQL remained skipped under the private-repository workflow condition and is not claimed as passed.

## Remaining external work

The remaining blockers are primarily live-system evidence and productization:

- authenticated Hyper-V lifecycle and failure injection;
- live scene and Teach recording;
- real owner demonstrations and held-out similarity evaluation;
- DPAPI/TPM key handling and secure erasure;
- Shadow process isolation;
- trusted credential insertion adapter;
- Assisted and synthetic Pilot execution;
- normal ChatGPT MCP acceptance;
- packaging, signing, update, rollback, uninstall, complete SBOM/provenance, penetration testing, privacy review, and operations.

Production remains denied.
