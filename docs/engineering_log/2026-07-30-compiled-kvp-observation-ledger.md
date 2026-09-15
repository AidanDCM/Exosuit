# Compiled KVP observation ledger

## Goal, phase, and gate

Move retained Hyper-V KVP observation acceptance from PowerShell into the
compiled Windows agent and add executable negative tests. Master-plan phase L3
owns this work. Promotion remains denied pending a fresh published-agent canary
and the live replay/restart/key-rotation matrix.

## Ownership and authority

Field-owned host observation and authenticated channel verification. This does
not add command execution, recording, policy administration, consent, key
rotation, export, or Glove authority.

## Files changed

- `apps/windows-agent/Program.cs`
- `apps/windows-agent/FieldKvpRuntime.cs`
- `apps/windows-agent.Tests/FieldKvpRuntimeTests.cs`
- `scripts/windows/Read-ExosuitFieldGuestKvp.ps1`
- `tests/windowsFieldScripts.test.ts`
- `docs/FIELD_IMPLEMENTATION_STATUS.md`
- `docs/FIELD_TEST_PLAN.md`
- `docs/qa/FIELD_THREAT_MODEL.md`
- `docs/qa/FIELD_FAILURE_INJECTION_MATRIX.md`
- this log

## Identity, generation, and policy impact

The ledger remains bound to exact Field ID, Field generation, key ID, and
guest-to-host direction. No generation or policy is created. A fresh agent/base
publication will be required before live validation; v20 evidence is not
retroactively attributed to this compiled implementation.

## Design and assumptions

Hyper-V KVP is a retained-value observation surface, not a command queue. Every
snapshot still undergoes current signature, expiry, direction, identity, key,
message-type, nonce, and within-snapshot ordering verification. The durable
ledger then allows an exact digest/message/sequence reread or requires a new
message ID and strictly greater sequence. All three records are accepted before
one durable atomic state replacement.

## Tests and commands actually run

- First `.NET Release build -warnaserror`: passed, zero warnings/errors.
- First focused `FieldKvpRuntimeTests`: passed, 5/5.
- First Windows script suite: 7/8; one obsolete assertion still required the
  superseded single-envelope CLI route.
- Updated the assertion to require the compiled snapshot route.
- Second `.NET Release build -warnaserror`: passed, zero warnings/errors.
- Second focused `FieldKvpRuntimeTests`: passed, 5/5.
- Second Windows script suite: passed, 8/8.
- `git diff --check`: passed.
- Repository validator: passed, 71 artifacts.
- Master-plan validator: passed, 22 phases.
- Field contract validator: passed, 84 artifacts and 26 modules.
- Typecheck: passed.
- Field suite: passed, 142/142.
- Field pulse: passed, 1/1.
- Full TypeScript suite: passed, 314/314.
- TypeScript build: passed.
- Glove pulse: passed, 1/1.
- Final `.NET restore`: passed.
- Final `.NET Release build --no-restore -warnaserror`: passed with zero warnings.
- Final `.NET Release tests --no-build`: passed, 49/49.

## Evidence, privacy, and unvalidated areas

Evidence classes are compiled unit and static script contract. Negative tests
cover exact retention, advancement, old-sequence mutation, message-ID reuse,
wrong-key state, malformed JSON, and unchanged accepted state after denial. No
secret, UI content, screenshot, input, or recording is emitted.

Live compiled-agent behavior, protected-state restart, stale generation, key
rotation, heartbeat loss, lock/Secure Desktop, VM pause/resume, and malicious
live KVP mutation remain unvalidated.

## Rollback and next slice

Revert the compiled snapshot CLI and return the reader to the prior host ledger;
repeat polling would remain available but the negative transition would lose
compiled executable coverage. Next publish the exact agent, build a new
immutable base, and repeat one development canary before live fault injection.
