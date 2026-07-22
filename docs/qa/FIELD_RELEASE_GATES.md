# Exosuit Field Release Gates

## Gate G0 — Repository integrity

- required source/tests/manuals exist;
- Field and repository validators pass;
- no forbidden secret shapes or arbitrary execution primitives;
- exact commit identified.

## Gate G1 — Compiled and tested foundations

- TypeScript strict typecheck;
- focused Field tests;
- full Field pulse;
- full repository tests/build and Glove pulse;
- .NET warnings-as-errors and tests;
- PowerShell parser pass;
- evidence artifacts retained.

## Gate G2 — Host and Hyper-V boundary

- host prerequisites;
- immutable parent digest;
- disposable differencing overlay;
- separate task and personal-state identity;
- Private switch or no network;
- forbidden integrations absent;
- rollback and exact-generation destruction;
- base/personal-state survival proof.

## Gate G3 — Guest trust

- authenticated transport;
- protected key storage and rotation;
- durable replay state;
- expected boot/agent/session/generation;
- heartbeat degradation/fault;
- bootstrap/display/lock/Secure Desktop;
- attestation and policy binding.

## Gate G4 — Teach privacy

- local owner consent;
- visible recording indicator;
- independent stop;
- no input injection;
- source allowlist;
- encrypted storage and deletion;
- visual budget/redaction/retention;
- credential-bearing controls excluded;
- privacy inspection accepted.

## Gate G5 — Shadow

- no-input process proof;
- exact observation/generation binding;
- prediction/actual comparison;
- owner-readable metrics;
- no automatic Pilot promotion.

## Gate G6 — Artifact boundary

- live reparse-aware scope;
- staging and final-destination hash;
- TOCTOU mitigation;
- classification/quarantine;
- owner-reviewed sensitive export;
- cancel and uncertain-copy recovery.

## Gate G7 — Pilot fixture

- one synthetic workflow only;
- typed guest commands enforced;
- fresh scene and policy recheck;
- action/runtime budgets;
- verification/reconciliation;
- emergency stop physically proven;
- audit chains valid;
- complete disposable reset.

## Gate G8 — Operational release

- installer/signing/updater/rollback;
- key and data retention operations;
- penetration test;
- support bundle and diagnostics;
- owner acceptance;
- production-specific threat review.

## Promotion rules

- G0-G1 are required before merging the Field source into the Glove build branch.
- G2-G3 are required before calling a live Field operational.
- G4 is required before recording owner demonstrations.
- G5 is required before claiming behavior learning.
- G6 is required before file workflows.
- G7 is required before any autonomous task claim.
- G8 is required before production use.
