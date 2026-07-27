# Atomic Audit — GitHub Expansion Slice

**Date:** 2026-07-21  
**Branch:** `build/exosuit-mvp`  
**Scope:** durable workflow state, supervisor routing, virtual-desktop intent lifecycle, browser guard, durable skills, performance governance, support bundles, and CI repair  
**Verdict:** **IMPLEMENTED WITH HOSTED-VALIDATION BLOCK**

## Evidence boundary

This addendum does not upgrade the new modules to `github_validated`.

GitHub Actions runs for the reviewed head fail before any workflow step starts. The CI, Windows, repository-contract, npm-audit, and NuGet-audit jobs report no executed steps. Therefore the repository cannot honestly claim hosted typecheck, tests, builds, or dependency audits for this expansion yet.

### Cause identified 2026-07-27

This audit recorded the symptom correctly but did not name the cause, and the "CI repair" work in this slice was therefore aimed at the wrong target. The cause is **GitHub account billing**, not workflow configuration.

Every job in every workflow carries the same GitHub annotation:

> The job was not started because recent account payments have failed or your spending limit needs to be increased. Please check the 'Billing & plans' section in your settings

Evidence:

| Run | Workflow | Date | Jobs affected |
|---|---|---|---|
| `29848199984` | Runner Smoke Test | 2026-07-21 | `Allocate ubuntu-latest`, `Allocate windows-latest` |
| `30303482508` | Exosuit CI | 2026-07-27 | all three jobs |
| `30303482527` | Security Audit | 2026-07-27 | npm dependency vulnerability audit |

`runner-smoke.yml` is the decisive control. Its jobs contain a single `echo`/`Write-Output` step and no checkout, dependencies, cache, or job dependencies. Both the Linux and Windows jobs fail identically with the billing annotation. A workflow that only requests a runner cannot fail for a configuration reason, which excludes YAML validity, `runs-on` labels, the project-surface detection gate, npm cache settings, and the missing lockfile.

The CI changes listed under "Implemented changes" below were therefore not fixes for this blockage. They may still be independently reasonable, but none of them could have restored hosted runs, and none should be cited as CI repair evidence.

The repository is private, so Actions draws on a monthly free-minutes allowance and `windows-latest` bills at roughly twice the Linux rate. Resolution requires the account owner to act in GitHub Billing & plans; it is not reachable from this repository.

This correction does not change any verdict in this audit. The hosted-validation block stands, and its reason is now stated accurately.

Existing Windows Sandbox evidence and earlier validated core evidence remain valid for the exact commits on which they were recorded. They do not automatically validate the new TypeScript expansion.

## Implemented changes

### CI and repository enforcement

- removed the brittle project-surface detection dependency from functional and security workflows;
- made TypeScript, Windows, repository-contract, npm-audit, and NuGet-audit jobs independent;
- removed npm cache configuration that required a missing lockfile;
- added `scripts/validate-repository.mjs`, a dependency-free source and safety invariant validator;
- added `npm run validate:repository` to the standard validation chain.

### Durable workflow state

- added AES-256-GCM workflow checkpoint persistence with authenticated encryption;
- added bounded checkpoint sizes, atomic replacement, wrong-key rejection, tamper rejection, and deletion;
- added environment-selected memory, integrity-protected file, or encrypted-file persistence;
- wired workflow checkpoint discovery and hydration into the actual stdio MCP startup path;
- added fail-closed startup behavior for corrupt supervisor state;
- kept sensitive artifacts disallowed in unencrypted persistent workflow storage.

### Durable supervisor state and routing

- added tamper-evident agent registry persistence and restart hydration;
- added capability- and contract-version-based command routing;
- required an attached authenticated command-channel abstraction before dispatch;
- added bounded command deadlines and response command/agent/workflow identity checks;
- added per-agent and global stop reporting, including unreachable agents;
- added cross-agent artifact transfer envelopes with integrity verification.

The routing abstraction does not yet provide a network transport or mutual authentication implementation. No remote agent is enabled by this slice.

### Virtual desktop coordination

- retained public/supported-interface design constraints;
- added tracked switch intents with TTL, cancellation, and explicit status;
- kept `requiresLocalApproval=true` and `automaticExecutionAllowed=false` as hard invariants;
- required a newer observed snapshot from the same agent/session before confirmation;
- required the fresh observation to identify the intended target desktop as current;
- rejected missing direction for approved-hotkey plans and rejected silent/manual ambiguity.

This does not claim native Windows virtual-desktop observation or switching. It is the coordinator-side state machine only.

### Browser semantic companion hardening

- added a bounded provider wrapper;
- added observation identity checks;
- added action-ID and returned-tab identity checks;
- rejected successful results without passed verification;
- retained exact-origin permission, stale-generation, sensitive-field, and prompt-injection controls in the existing browser foundation.

No browser extension or native-messaging transport is enabled by this slice.

### Durable skills

- retained signed manifest verification, scope budgets, disable-by-default, revocation, and permission-expansion review;
- added atomic tamper-evident installed-skill persistence;
- reconstructed enabled and revoked state after restart;
- rejected duplicate skill identities and impossible enabled+revoked persisted state.

This does not enable skill autopilot or reduce action-level approval requirements.

### Performance and resource governance

- added bounded metric sampling and p50/p95/p99/max summaries;
- added minimum-sample regression thresholds;
- added tracked-window, workflow, agent, audit-storage, memory, and idle-CPU admission limits;
- added a bounded concurrency gate with queue cancellation and underflow protection.

Numeric production targets remain unapproved until interactive benchmark evidence exists.

### Privacy-safe support bundles

- added strict metadata-only support bundle schemas;
- added integrity hashes and atomic writes;
- hashed private agent identifiers;
- excluded unknown fields and rejected tokens, credentials, private keys, screenshot bytes/data, clipboard contents, element values, window titles, and raw payloads;
- permitted safe boolean configuration-state flags such as `screenshotsEnabled=false`.

## Added or expanded test files

- `tests/encryptedCheckpointStore.test.ts`
- `tests/runtimeFactory.test.ts`
- `tests/serverStartup.test.ts`
- `tests/supervisorStore.test.ts`
- `tests/supervisorRouter.test.ts`
- `tests/virtualDesktop.test.ts`
- `tests/browserCompanionGuard.test.ts`
- `tests/skillStore.test.ts`
- `tests/performance.test.ts`
- `tests/supportBundle.test.ts`

These tests are committed but are not represented as passing on the current expansion head until an execution environment runs them.

## Static review findings corrected during the slice

1. Optional checkpoint-size configuration was explicitly passed as `undefined`, conflicting with strict optional-property semantics. The option is now omitted when unset.
2. npm cache setup depended on a lockfile that is not present. Cache setup was removed.
3. Support-bundle schemas initially stripped unknown fields. Boundaries are now strict.
4. The first screenshot privacy-key pattern also blocked harmless `screenshotsEnabled` metadata. It now targets screenshot content fields rather than state flags.
5. Encrypted checkpoint inventory initially exposed one-way workflow hashes instead of authenticated workflow IDs. Inventory now decrypts and verifies before returning IDs.

## Denied-by-absence boundaries

The following remain unavailable:

- arbitrary shell/process execution;
- automatic virtual-desktop switching;
- undocumented virtual-desktop enumeration;
- remote-agent network transport;
- unattended consequential workflows;
- screenshot capture;
- browser extension/native messaging;
- production skill autopilot;
- installer or auto-update;
- production accounts or real consequential targets.

## Promotion requirements

Before this expansion can be labeled `github_validated`:

1. `npm run validate:repository` passes;
2. strict TypeScript typecheck passes;
3. all TypeScript unit and integration tests pass;
4. production TypeScript build passes;
5. full-chain system pulse passes;
6. Windows Release build and .NET tests pass;
7. repository contract passes;
8. npm high/critical audit passes;
9. NuGet direct/transitive audit completes without known vulnerable packages;
10. exact run IDs and commit SHA are attached to this audit.

Before any new local capability is enabled, its corresponding interactive Windows, VM, browser, or ChatGPT acceptance matrix must also pass.
