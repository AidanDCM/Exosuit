# Engineering Log: Field Source-Only Exhaustion Pass

**Started:** 2026-07-21T14:00:00-04:00  
**Completed:** 2026-07-21T15:30:00-04:00  
**Branch:** `agent/field-foundation`  
**Subsystem:** Field and shared Glove/Field contracts  
**Evidence class:** source/static review and tests written; no executable repository or live Windows evidence captured

## Goal

Build, document, test, and statically validate every useful Field component that can be responsibly completed through repository changes without claiming access to a running Windows/Hyper-V host.

## Mandatory acknowledgement

- Glove and Field remain separate.
- The model/pilot cannot administer the Field.
- Teach and Shadow cannot inject input.
- Live behavior cannot be called passed unless commands actually run and evidence is captured.
- The base image must remain immutable.
- Uncertain external effects cannot retry blind.

## Files added

### TypeScript runtime foundations

- `src/fieldChannel.ts`
- `src/fieldHeartbeat.ts`
- `src/fieldBootstrap.ts`
- `src/fieldCommand.ts`
- `src/teachRecorder.ts`
- `src/visualRetention.ts`
- `src/fieldRecovery.ts`
- `src/fieldAdminAuthority.ts`
- `src/fieldSupportBundle.ts`

### Tests and fixtures

- `tests/fieldChannel.test.ts`
- `tests/fieldHeartbeat.test.ts`
- `tests/fieldBootstrap.test.ts`
- `tests/fieldCommand.test.ts`
- `tests/teachRecorder.test.ts`
- `tests/visualRetention.test.ts`
- `tests/fieldRecovery.test.ts`
- `tests/fieldAdminAuthority.test.ts`
- `tests/fieldSupportBundle.test.ts`
- `tests/fieldChannelWireContract.test.ts`
- `tests/fieldSystemPulse.test.ts`
- `tests/windowsFieldScripts.test.ts`
- `tests/fixtures/field-channel-v1.json`

### Windows agent parity

- `apps/windows-agent/FieldChannelFoundation.cs`
- `apps/windows-agent.Tests/FieldChannelFoundationTests.cs`
- `apps/windows-agent.Tests/FieldChannelWireContractTests.cs`

### Windows/Hyper-V operations

- `scripts/windows/Test-ExosuitFieldHost.ps1`
- `scripts/windows/Show-ExosuitFieldProvisioningPlan.ps1`
- `scripts/windows/Invoke-ExosuitFieldProvisioning.ps1`
- `scripts/windows/Remove-ExosuitFieldGeneration.ps1`
- `scripts/windows/Initialize-ExosuitFieldGuest.ps1`
- `scripts/windows/Invoke-ExosuitFieldValidation.ps1`
- `vm/field-host-config.example.json`

### Manuals and audit

- `docs/FIELD_WINDOWS_RUNBOOK.md`
- `docs/qa/FIELD_THREAT_MODEL.md`
- `docs/qa/FIELD_FAILURE_INJECTION_MATRIX.md`
- this engineering log

## Files materially updated

- `src/fieldProvisioningPlan.ts`
- `tests/fieldProvisioningPlan.test.ts`
- `src/fieldSupportBundle.ts`
- `tests/fieldChannel.test.ts`
- `package.json`
- `scripts/validate-field.mjs`
- `.github/workflows/ci.yml`
- `apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj`
- `README.md`
- `AGENTS.md`
- `docs/FIELD_IMPLEMENTATION_STATUS.md`

## Major decisions

### 1. Immutable base image requires a writable child overlay

**Problem:** An immutable Windows base VHDX cannot itself serve as the normal writable boot disk.

**Decision:** Add a disposable differencing runtime overlay to every Field generation. The base remains the parent. The VM boots from and writes to the child overlay.

**Why:** This preserves golden-image integrity, enables deterministic reset, and confines destruction to generation-owned state.

### 2. Model/pilot has zero administration authority

**Decision:** Add a separate administration actor and decision contract. `pilot_model` is blocked from all administration. Service authority is limited to lifecycle execution. Consent, key rotation, deletion, and sensitive export require an interactive local owner.

### 3. Host/guest messages require replay-resistant authentication

**Decision:** Bind message ID, Field generation, direction, sequence, type, timestamps, nonce, key ID, payload hash, and payload under HMAC-SHA256. Add TypeScript/.NET parity and one shared signed fixture.

### 4. Teach recorder cannot share motor authority

**Decision:** The Teach recorder state machine has `inputInjectionAllowed: false`, no motor dependency, explicit consent, visible-state output, bounded sources, and terminal failure behavior.

### 5. Visual data is a separate policy and storage problem

**Decision:** Demonstration metadata cannot contain inline frame bytes. Visual capture uses external references, explicit consent, sensitive-region redaction, approved-region/change-only mode, and byte/count/TTL limits.

### 6. Recovery is deterministic and asymmetric

**Decision:** Permit only a bounded retry for idempotent operations with no external effect. A possible unverified external effect freezes and reconciles. Trust-boundary changes create a new Field generation. Emergency-stop failure blocks release and receives no automated recovery.

### 7. PowerShell tooling is typed, guarded, and evidence-producing

**Decision:** Provide read-only checks and plan resolution, dry-run by default, exact typed confirmation for apply/destroy, no downloads or arbitrary evaluation, path confinement, digest verification, and evidence JSON.

## Parts & Pieces application

| Donor/pattern | Application |
|---|---|
| command broker | typed Field plans and commands; no model shell strings |
| event ledger | Field Manager hash-linked audit and support summaries |
| reconciliation | no-blind-retry recovery and artifact verification |
| loop detector | action/retry/event/frame budgets |
| system pulse | full fake Field chain |
| path scope | Windows-specific path and reparse boundary |
| redaction scan | demonstration and support-bundle exclusion |
| evidence source guard | source/pure/live evidence separation |
| approval gate | local admin and owner presence; model cannot satisfy review |
| Atomic Audit | threat, failure, assumptions, gaps, and rollback documentation |

## Static defects discovered and repaired

1. Signature-mutation test could accidentally preserve the original final character.
   - Fixed by selecting a guaranteed different A/B replacement.
2. Full Field pulse passed extra aggregate visual-budget fields into a strict support schema.
   - Fixed by explicitly allowing non-sensitive maximum budget aggregates.
3. Legacy provisioning-step absence assertion used a brittle `never` cast.
   - Fixed with a string-view assertion.
4. Windows script tests attempted to construct regexes from backslash paths.
   - Fixed with literal string containment checks.
5. Guest bootstrap attempted to read a nonexistent manifest digest property.
   - Fixed with a required externally supplied 64-hex digest.
6. Guest bootstrap implied Secure Desktop could be confirmed before the agent runs.
   - Fixed: check remains failed/pending runtime confirmation.
7. CI assumed a nonexistent `package-lock.json` for npm caching.
   - Fixed by removing the cache assumption.
8. VM storage model attached an immutable base without an explicit writable boot layer.
   - Fixed with a mandatory disposable differencing OS overlay.

## Commands actually run

No repository build, test, npm, dotnet, PowerShell, or Hyper-V command was executed in this GitHub connector session.

An independent local reasoning calculation recomputed the shared channel fixture:

- payload SHA-256: `1b5130072c4824e9ff4bbed304a0cec7825e64cdd49bddc0b25db0dadc5d2471`
- HMAC-SHA256 base64url signature: `MyFGbZzyJCi3oBZrMTvobtZxJm10RzQHL2fKEonef2M`

This verifies fixture arithmetic only. It is not repository test execution.

## Tests written

The new test coverage includes:

- message authentication, mutation, expiration, direction, generation, replay, nonce, and sequence;
- guest boot identity and heartbeat liveness;
- bootstrap identity, exact directories, checks, timestamps, and readiness;
- Teach consent, indicator, source allowlist, pause/resume, abort, and fault;
- visual consent, capture modes, redaction, limits, and expiration;
- no-blind-retry recovery and generation replacement;
- local administration versus pilot authority;
- typed guest action policy, route, scene, ordinal, budget, and mode;
- privacy-safe support bundle and integrity;
- TypeScript/.NET channel fixture;
- full fake Field system pulse;
- static PowerShell safety and confinement.

## Security and privacy impact

Positive:

- no arbitrary shell is introduced;
- no model administration authority is introduced;
- stale/replayed traffic is denied;
- Teach and Shadow remain non-executing;
- visual content remains separately consented and externally stored;
- the base image remains immutable;
- generation deletion is bounded;
- diagnostic content is aggregate and hashed;
- uncertain external effects do not retry blind.

Residual risk:

- replay state is in-memory;
- channel key storage/rotation is not implemented;
- scripts are unexecuted;
- live transport and Windows agent integration do not exist;
- visual and input hooks do not exist;
- no actual Hyper-V isolation or destruction evidence exists.

## Rollback

All new Field modules remain disconnected from the live Glove runtime. The source-only pass can be rolled back by reverting its commits. Live apply scripts require explicit `-Apply` plus exact local confirmation and were not run.

## Next unavoidable slice

Execute `scripts/windows/Invoke-ExosuitFieldValidation.ps1` on the exact branch head. Repair confirmed failures. Only then begin disposable Hyper-V acceptance using synthetic data and the procedure in `docs/FIELD_WINDOWS_RUNBOOK.md`.
