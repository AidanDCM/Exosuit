# Product parity and task-layer build-out

## Objective

Move Exosuit from a repository-heavy architecture toward a seamless personal-agent product without pretending that live Windows acceptance has occurred.

The implementation focused on the largest repository-only gaps:

- ChatGPT MCP and API brain routing;
- task-level rather than click-level model interaction;
- persistent resumable tasks;
- reviewed task recipes;
- grouped approvals and recovery state;
- encrypted task persistence;
- privacy-safe cockpit contracts;
- deterministic installation preflight;
- measurable MVP and daily-driver gates;
- signed release lifecycle planning.

## Development direction

The committed direction is documented in `docs/PRODUCT_PARITY_ROADMAP.md`.

Exosuit is not attempting to reproduce every UiPath or Microsoft enterprise feature. The immediate product target is one owner operating one isolated Windows Field with:

- normal startup;
- ChatGPT MCP as the preferred interactive brain;
- a bounded API fallback;
- high-level goals and recipes;
- transparent progress and approvals;
- reliable pause, resume, cancellation, recovery, and emergency stop;
- consented Teach, no-input Shadow, Correction, and bounded Assisted use;
- encrypted and reversible personal state.

## Source added

### `src/brainRouting.ts`

Selects ChatGPT MCP, OpenAI API, or fail-closed unavailable state based on interaction mode, capabilities, continuity requirements, and API budget.

### `src/personalTaskControl.ts`

Adds integrity-bound task sessions, checkpoints, recovery state, approval grouping, five initial recipes, and trusted-local-adapter-only outcome recording.

### `src/productMcp.ts`

Adds ten high-level product tools while deliberately omitting any tool that can claim execution success.

### `src/encryptedProductTaskStore.ts`

Adds AES-256-GCM encrypted task persistence with hashed filenames, atomic writes, size limits, wrong-key rejection, ciphertext authentication, and task-hash validation.

### `src/cockpitState.ts`

Adds privacy-safe cockpit state and event contracts without raw goals, variables, screenshots, credentials, or persona text.

### `src/productReadiness.ts`

Adds deterministic host preflight and quantitative MVP/daily-driver benchmark evaluation. Synthetic-only evidence cannot promote the MVP.

### `src/productLifecycle.ts`

Adds Ed25519 release-manifest verification, component/path integrity, deterministic lifecycle plans, owner-data deletion confirmation, and diagnostic redaction. Plans remain non-executing.

## MCP composition

The server now distinguishes:

- `core`: 13 reviewed desktop tools;
- `product`: core plus ten high-level task tools;
- `full`: product plus fourteen coordinator tools.

`core` remains the default. Unknown values fail startup.

Product-task start and resume use a trusted local readiness provider rather than a model argument. Only explicit fake development readiness is currently accepted.

## Durable-state posture

Durable product tasks require both:

```text
EXOSUIT_PRODUCT_TASK_DIR
EXOSUIT_PRODUCT_TASK_KEY
```

The key must decode to exactly 32 bytes. Supplying only one setting fails startup.

This is not the production key-management solution. DPAPI/TPM sealing, rotation, recovery, and secure erasure remain live product work.

## Validation

Validated source head:

```text
d91a9701d8faab4220441de9553eb1647c0164b8
```

Hosted results:

- Exosuit CI `30926779304`: passed;
- Security Audit `30926782740`: supported jobs passed;
- 47 focused test files and 230 focused tests passed;
- 79 full TypeScript test files and 406 tests passed;
- both system pulses passed;
- TypeScript typecheck and production build passed;
- PowerShell parsing passed;
- .NET build passed with zero warnings and errors;
- 48 .NET tests passed;
- 149-component CycloneDX npm SBOM generated;
- npm audit reported zero vulnerabilities;
- NuGet reported no vulnerable direct or transitive packages.

See `docs/qa/ATOMIC_AUDIT_2026-08-04_PRODUCT_PARITY_LAYER.md` for artifact IDs, hashes, repaired validation defects, and exact promotion boundaries.

## What remains external

The next useful engineering work must exercise the target Windows machine:

1. Collect real host preflight facts.
2. Provision and authenticate the real Field.
3. Connect the real readiness provider.
4. Connect ChatGPT through a private authenticated MCP route.
5. Produce live scenes.
6. Record consented Teach episodes.
7. Run no-input Shadow comparisons.
8. Implement the trusted local task-chunk adapter.
9. Complete five low-risk recipes in Assisted Mode.
10. Build and test the graphical cockpit.
11. Implement and test the Windows installer/service lifecycle from the non-executing plans.
12. Accumulate live benchmark evidence before MVP promotion.

## Promotion posture

- source foundation: validated;
- fake development acceptance: permitted within existing controls;
- real owner-derived model activation: denied;
- live Assisted execution: denied;
- Pilot: denied;
- production: denied.
