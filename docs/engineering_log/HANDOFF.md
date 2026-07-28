# Exosuit Engineering Handoff

**Updated:** 2026-07-28  
**Active integration branch:** `codex/unify-glove-field`  
**Production decision:** denied

## What Exosuit is

Exosuit is a local Windows execution and learning system with two separately governed subsystems:

- **Glove:** MCP gateway, observation, policy, execution, verification, workflow, audit, and emergency stop.
- **Field:** isolated Windows environment, VM/storage lifecycle, guest identity/channel/readiness, task workspace, and consent-bound teaching surfaces.

The brain proposes; the local host owns permission and execution. The Field cannot grant Glove permission, and the model cannot create consent, approve its own action, provision a VM, rotate keys, or enable full control.

## Current repository state

The former canonical Glove branch `build/exosuit-mvp` at `4411568` and Field branch `codex/issue-20-personal-disk-identity` at `e10e921` are being consolidated on `codex/unify-glove-field`. The branches shared ancestor `5302cf0`; the Field line contributed 275 commits and the Glove line 19 commits after that ancestor. The integration had seven textual conflicts, all resolved without broadening defaults:

- `EXOSUIT_MCP_SURFACE=core` remains the default; full coordinator tools are opt-in.
- the stronger prompt-injection guard was retained;
- canonical parity, benchmark, and pre-push hooks were retained;
- Field validators, lockfile, guest runtime, VM scripts, tests, manuals, and evidence contracts were added;
- CI uses `npm ci`, and the repository validator discovers every TypeScript source module rather than trusting a hand-written list.

Working-tree validation before the merge commit passed, followed by exact-head validation on the hardened consolidated commit `7a7c435`:

- repository safety validator: 71 required artifacts;
- master plan validator: 22 program sections;
- Field validator: 71 artifacts and 20 Field modules;
- TypeScript typecheck and build;
- 284/284 TypeScript tests at the hardened head;
- Glove and Field system pulses;
- .NET Release build with zero warnings;
- 44/44 .NET tests;
- locked npm install and audit with zero vulnerabilities.

Exact-head L0 recorded 15/15 steps passed under `artifacts/field-validation/20260728T191511Z`. Clean-checkout parity passed 12/12 repeatedly, including every pre-push publication gate. This is strong local evidence, not independent hosted CI attestation.

## Evidence that already exists

- Field head `e10e921` passed `Invoke-ExosuitFieldValidation.ps1` on 2026-07-28. Evidence root: `artifacts/field-validation/20260728T181750Z` in the Field worktree.
- A disposable v13 development generation has recorded provisioning, guest bootstrap, authenticated Hyper-V KVP channel, heartbeat, and readiness evidence under `artifacts/field-l4-v13-boot/generation-1`.
- Glove source gates, local CI parity, and selected Windows Sandbox physical-input/emergency-stop evidence predate the integration.

Evidence limits matter: v13 used development auto-login and unattended setup, is not a production-authentication result, and does not prove Teach, Shadow, Pilot, real accounts, or production. Hosted GitHub Actions remains blocked before checkout by account billing.

## Corrected environment diagnosis

Do not send the owner to BIOS based only on `VirtualizationFirmwareEnabled: False`. On this host:

- `HyperVisorPresent` is true;
- `vmms`, `vmcompute`, and `hns` are running;
- reviewed base VHDX images v10, v12, v13, and v14 exist.

Once the Windows hypervisor is active, the processor virtualization flag can be misleading. The recurring automation blocker has been non-elevated Hyper-V/VMConnect access and UAC boundaries, plus guest/base-image setup failures—not an established BIOS failure.

## Engineering completion estimate

These percentages are planning estimates, not release claims:

| Area | Implemented | Evidenced | Close to production-complete |
|---|---:|---:|---:|
| Governance and safety contracts | 100% | 100% | 100% |
| Glove Windows core and ChatGPT surface | 100% | 40% | 55% |
| Multi-window coordination | 95% | 50% | 60% |
| Virtual-desktop coordination | 60% | 15% | 30% |
| Supervisor, multi-agent, and Field management | 75% | 30% | 45% |
| Browser companion | 40% | 10% | 20% |
| Visual sensor and privacy pipeline | 15% | 0% | 5% |
| Teach and demonstration foundations | 55% | 20% | 30% |
| Processing, Shadow, Correction, and personal models | 30% | 10% | 15% |
| Skills and Assisted Mode | 50% | 15% | 25% |
| Cockpit and owner controls | 15% | 5% | 10% |
| Reliability and recovery | 73% | 32% | 48% |
| Performance and capacity | 65% | 35% | 50% |
| Packaging, signing, update, uninstall | 0% | 0% | 0% |
| Production security/privacy operations | 10% | 5% | 5% |
| Cross-platform work | 0% | 0% | 0% |
| Release and support operations | 0% | 0% | 0% |

Overall: approximately **65% implemented, 30% evidenced, and 20–25% production-ready**. The evidence gap, not raw source volume, is the main constraint.

## Autonomous work that remains safe to perform

1. Commit the integration and run exact-head L0 plus clean parity.
2. Fix source/test/documentation defects found by those gates.
3. Harden authentication ordering, visual-redaction bounds, and uncertain browser outcomes with negative tests and Level 4 audit updates.
4. Reconcile current readiness manifests and manuals with exact evidence.
5. Continue fake/pure failure-injection coverage; durable Field Manager restart, corruption, and bounds coverage is implemented.
6. Prepare reproducible non-mutating Hyper-V plans and read-only capability evidence.
7. Implement source-only components behind disabled defaults where the roadmap has no owner gate.
8. Keep every slice independently disableable and push it to a review branch/draft PR.

## Work that cannot be self-approved

- owner recording consent or Teach privacy acceptance;
- policy activation, Field administration, key rotation, sensitive export, or credential administration;
- owner acceptance or production decision;
- real accounts, consequential websites, or client tasks;
- enabling live visual capture, input recording, Assisted, Pilot, or full-control defaults;
- security/privacy design gates explicitly requiring owner review;
- changing the workflow persistence contract solely to improve scheduler performance;
- fixing GitHub account billing.

## Next execution order

1. Keep the readiness manifest and handoff aligned with exact evidence while production remains denied.
2. The identified authentication-ordering, visual-redaction, and browser-uncertainty residuals are closed with Level 4 addenda.
3. Repeat the production-authentication Field lifecycle and negative-case matrix when an elevated disposable session is available.
4. Scene producer, then separately reviewed Teach privacy/recording.
5. Finish encrypted derived demonstration storage and quality evaluation, then Shadow, Correction, and personal-model evaluation; deterministic segmentation, retrieval, deletion, and held-out partitioning now exist.
6. Assisted and synthetic Pilot with physical emergency stop and no-blind-retry reconciliation.
7. ChatGPT acceptance, packaging/signing/update/rollback, security/privacy/penetration, reliability soak, operations, and owner acceptance.

## Rollback

- Integration rollback: return to `build/exosuit-mvp` at `4411568`; the Field line is preserved remotely at `origin/codex/issue-20-personal-disk-identity` (`e10e921`).
- Runtime rollback: keep the MCP surface at `core`, fake provider default, Windows observe mode, physical input disabled, recording disabled, and Pilot denied.
- Field rollback: stop the exact generation, preserve sanitized evidence, destroy only disposable generation state, increment generation, and retain base/personal state unless separately owner-authorized.
