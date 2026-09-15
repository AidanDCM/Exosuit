# CHN-001 fail-closed acceptance contract

## Change report

- **Goal:** prevent partial, development-only, or prose-only channel evidence
  from promoting CHN-001 while preparing the next live acquisition slice.
- **Master-plan phase and promotion gate:** M1, CHN-001.
- **Subsystem ownership:** Field owns the isolated environment and KVP
  transport; the Glove/host verifier owns message acceptance and emergency-stop
  authority. Their identities, policies, evidence, and failure states remain
  separate.
- **Files changed:** `src/completion/chn001.ts`, CHN tests/package command,
  bounded KVP reader selection/replay-state parameters, runbook, Level 4 audit,
  threat/failure documentation, and this log.
- **Identity/generation and policy impact:** every accepted message must bind one
  exact Field ID, generation, boot ID, direction, and channel key. No policy is
  created or expanded; the pilot cannot satisfy or sign the contract.
- **Parts & Pieces and donor patterns considered:** the existing Field replay
  guard, KVP reader, bootstrap evaluator, heartbeat monitor, completion evidence
  boundary, and exact-generation destruction pattern were reused. No donor
  repository evidence is accepted.
- **Questions and assumptions:** the frozen completion manifest's concise CHN
  criterion is interpreted through the twelve authoritative matrix rows. Real
  Windows lock/Secure Desktop/display and stop ceremonies cannot be replaced by
  host-manufactured envelopes.
- **Tests added or updated:** nine CHN contract tests plus static coverage for
  selective KVP capture and a caller-owned durable replay-state path.
- **Commands actually run:** `npm run test:chn001 -- --reporter=verbose` and
  `npm run typecheck` passed before documentation closeout. Broad Field,
  repository, build, pulse, PowerShell parse, and .NET validation are required
  before commit and recorded below after execution.
- **Results and evidence class:** source contract only; no live
  `hyperv_host_guest` evidence is claimed. CHN-001 remains `source_validated`.
- **Assumptions and unvalidated areas:** live production authentication,
  rotation, reboot, heartbeat loss, guest lock, Secure Desktop, display change,
  all three emergency-stop contexts, and cleanup remain unvalidated by this
  slice.
- **Security and privacy impact:** the run schema contains only bounded metadata
  and hashes. It forbids development access and does not contain secrets,
  screenshots, UI text, or demonstration bytes. Selective capture still uses
  the exact compiled verifier and shared durable replay high-water mark.
- **Field-specific failure behavior:** unknown/mutated/replayed/wrong identity,
  direction, generation, key, boot, expiry, readiness, and stop state fail the
  run. Session lock, Secure Desktop, heartbeat loss, replay, and emergency stop
  are mandatory evidence, not optional notes. No host/Field data transfer is
  introduced; immutable base and exact disposable cleanup remain required.
- **Rollback or disable path:** revert this source/docs slice. The KVP reader's
  default remains all three messages with replay state in its evidence directory.
  No Field or ledger state is created by this slice.
- **Next recommended slice:** implement the elevated acquisition runner, build
  it on a clean commit, and execute the complete production-configured matrix.

## Validation closeout

- PowerShell parser: passed for the changed KVP reader.
- Repository, master-plan, and Field validators: passed (71 repository
  artifacts; 84 Field artifacts and 26 source modules).
- Focused CHN suite: 4 files, 19/19 passed.
- Field suite: 48 files, 239/239 passed.
- TypeScript typecheck and build: passed.
- Full TypeScript suite: two concurrent attempts ran all 653 tests successfully
  but exited nonzero on two Vitest worker `onTaskUpdate` RPC timeouts. These are
  recorded as runner-load anomalies, not repository passes or failures. A direct
  one-worker rerun then passed 92 files and 653/653 tests with exit code 0 and no
  unhandled errors.
- Glove and Field pulses: 1/1 each passed.
- .NET restore/build/test: build passed with zero warnings/errors; 48/48 tests
  passed.

No live Field was created and no CHN evidence or completion transition was
recorded. OneDrive was paused for the clean serial run and restarted afterward.
