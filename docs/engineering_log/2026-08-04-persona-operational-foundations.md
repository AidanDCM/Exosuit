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
- prediction-only Shadow capability and no-forward receipts;
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

## Validation state

All files and tests are committed to `codex/unify-glove-field`. Exact-head hosted CI, security audit, Windows build/tests, and SBOM generation must pass before the audit is updated from pending.

## Remaining external work

The remaining blockers are primarily live-system evidence and productization:

- authenticated Hyper-V lifecycle and failure injection;
- live scene and Teach recording;
- real owner demonstrations;
- DPAPI/TPM key handling;
- Shadow process isolation;
- trusted credential insertion adapter;
- Assisted and synthetic Pilot execution;
- normal ChatGPT MCP acceptance;
- packaging, signing, update, rollback, uninstall, complete SBOM/provenance, penetration testing, privacy review, and operations.
