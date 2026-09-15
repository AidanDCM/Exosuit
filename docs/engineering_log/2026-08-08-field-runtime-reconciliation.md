# Field runtime reconciliation

## Goal and plan gate

Reconcile the locally validated Field runtime history from `codex/unify-glove-field`
with the completion-gate branch so CHN-001 can be developed and executed against
source that reproduces the v25 base image. This is shared completion/Field work in
M1, gate CHN-001; it does not promote CHN-001 or claim new live evidence.

## Ownership and authority impact

The merged implementation is Field-owned. It restores the protected guest KVP
secret reader, protected observation ledger, key-rotation coordinator, and narrow
local owner build-fabric service. It does not grant the Glove, pilot, model, or MCP
environment authority. The owner service accepts only fixed, hash-bound,
exact-generation operations under local policy; it cannot create or expand policy,
grant recording consent, inject input, rotate keys through MCP, or export data.

Rebuild and rollback continue to invalidate the exact Field generation. The base
image remains immutable; provisioning and destruction target only the disposable
overlay, task disk, and exact generation root. No personal-state disk is introduced.

## Files and donor patterns

The merge preserves the 36-commit Field history rooted at `250c3e8` and its original
engineering logs and Level 4 audits. Main implementation surfaces include:

- `apps/field-owner-service/`;
- protected channel-secret and KVP readers in `apps/windows-agent/`;
- `src/fieldChannelKeyRotation.ts` and its protected store;
- owner install/job scripts and guest startup/provisioning scripts under
  `scripts/windows/`;
- Field architecture, runbook, threat-model, failure-matrix, and tests.

Parts & Pieces patterns considered were exact path scope, narrow service authority,
atomic publish/rename, authenticated state, and deny-by-default generation binding.
No donor tests are counted as Exosuit evidence.

## Conflict decisions

- Retained the current completion, product, persona, and safety test lanes while
  adding the recovered key-rotation tests to `test:field`.
- Retained the compiled `--field-observe-kvp-snapshot` path and protected observation
  ledger. The earlier selective per-envelope reader was removed because it would
  bypass the stronger atomic snapshot contract.
- Combined the current CHN-001 residual-risk statement with the recovered protected
  secret/rotation detail. No Hyper-V socket or bidirectional transport is claimed.
- Preserved both the current denial statement and the recovered owner-service usage
  documentation in the README.

## Questions and assumptions

The branch-local v25 receipts and source history are treated as historical evidence,
not as proof for this new merge commit. The exact merged head still requires its own
complete validation and any future live CHN-001 run must bind that exact clean commit.
The owner-service installation remains a separate, visible owner-authorized action.

## Tests and commands run

- `npm run validate:repository` — passed, 88 required artifacts.
- `npm run validate:plan` — passed, 22 phased sections.
- `npm run validate:field-contract` — passed, 88 artifacts and 28 modules.
- `npm run typecheck` — passed.
- `npm run build` — passed.
- focused Vitest run for Windows Field scripts, rotation, rotation store, and CHN-001
  contract — 37/37 passed.
- `.NET SDK 8.0.423 restore/build -warnaserror/test` — build passed with zero
  warnings/errors; 81/81 tests passed.

These results are source/fake-provider evidence only. The complete exact-head suite
and Windows evidence runner remain required before live use.

## Security, privacy, and failure behavior

Unknown identity, generation, key, replay state, owner authorization, queue item,
hash, or receipt fails closed. Guest startup denies plaintext fallback. Session lock,
Secure Desktop, display mismatch, heartbeat loss, replay, overflow, uncertain effect,
and emergency stop remain governed by the existing Field policies; CHN-001 must still
exercise them live. Recording cannot begin without explicit visible consent and this
slice adds no recording or cross-Field data path.

## Rollback

Revert the reconciliation merge commit. If the owner service was separately installed,
use the reviewed uninstall script and verify the fixed service and queue roots are
absent. Destroy only an exact disposable Field generation; never remove or modify the
base image.

## Next slice

Implement the CHN-001 acquisition/orchestration runner around the protected snapshot
observer, with dry-run planning and explicit owner ceremony checkpoints. Do not record
completion until all 12 injections, three independent stops, cleanup, and immutable
base verification are present in one exact-commit run artifact.
