# Engineering Log — Glove and Field Foundation

**Timestamp:** 2026-07-21T13:32:27-04:00  
**Branch:** `agent/field-foundation`  
**Base branch:** `build/exosuit-mvp`

## North Star goal

Add the Exosuit Field beside the existing Exosuit Glove in the same repository while keeping both systems explicitly separate. Implement and document the largest safe foundation slice that can be reviewed and tested without claiming live VM, recording, learning, or autonomous execution behavior.

## Subsystem ownership

- Glove: pilot connection, planning, policy, action execution, verification, recovery, audit, stop.
- Field: isolated Windows environment, identity/generation, display, storage, mode, demonstration surface, VM lifecycle.
- Shared: authenticated binding, structured artifacts, contract versions, redaction vocabulary, deadlines, support evidence.

## Files added

### Source

- `src/fieldContracts.ts`
- `src/fieldRegistry.ts`
- `src/demonstration.ts`
- `apps/windows-agent/FieldFoundation.cs`

### Tests

- `tests/fieldContracts.test.ts`
- `tests/fieldRegistry.test.ts`
- `tests/demonstration.test.ts`
- `apps/windows-agent.Tests/FieldFoundationTests.cs`

### Manuals and QA

- `docs/GLOVE_FIELD_BOUNDARY.md`
- `docs/FIELD_ARCHITECTURE.md`
- `docs/FIELD_OWNER_MANUAL.md`
- `docs/FIELD_DEVELOPER_MANUAL.md`
- `docs/FIELD_TEST_PLAN.md`
- `docs/qa/GLOVE_FIELD_PARTS_TRACEABILITY.md`
- `docs/qa/ATOMIC_AUDIT_2026-07-21_GLOVE_FIELD_FOUNDATION.md`
- this log

## Implemented behavior

- explicit `glove` and `field` subsystem vocabulary,
- Field ID and monotonically increasing generation,
- agent/machine/session/image/personal-state/task-disk identity,
- fixed display contract,
- bounded Teach/Shadow/Pilot policy,
- hard false host/privilege boundary fields,
- canonical policy hashing,
- short-lived HMAC-SHA256 Field attestation,
- constant-time signature comparison,
- separate Field lifecycle registry,
- explicit fault reasons,
- Glove agent binding,
- consent-bound demonstration episode,
- ordered bounded events,
- recursive secret-shaped key redaction,
- completion/abort and summary,
- parallel Windows-side pure foundation.

## Parts & Pieces and donor patterns considered

- Atomic Audit Level 4 structure,
- Question Everything atomic unit reports and ledgers,
- North Star freeze and traceability,
- command-broker typed boundary rather than arbitrary shell,
- event-ledger separation by actor/subsystem,
- reconciliation after uncertain effects,
- loop/event budgets,
- system pulse planned for fake Field Manager,
- evidence-source guard,
- path-scope prerequisite activated for future artifact transfer,
- manualization and per-entry engineering log.

Full mapping: `docs/qa/GLOVE_FIELD_PARTS_TRACEABILITY.md`.

## Tests added

TypeScript tests cover:

- valid Field identity/display/policy,
- policy-attestation binding,
- changed policy and generation rejection,
- expiry/signature/consent/duplicate rejection,
- Field lifecycle and Glove binding,
- invalid transitions and fault reasons,
- demonstration sources, ordering, completion, summaries,
- recursive redaction and event limits.

.NET tests cover:

- Field identity/display validation,
- subsystem separation,
- lifecycle and Glove binding,
- invalid transitions and fault evidence,
- demonstration payload redaction.

## Commands actually run

No repository test command was available through the GitHub connector used for source writes. No test is claimed passing in this log yet.

Required next commands:

```bash
npm install --ignore-scripts
npm run validate:repository
npm run typecheck
npm test -- --reporter=verbose
npm run build
npm run test:pulse -- --reporter=verbose
```

```powershell
dotnet restore apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj
dotnet build apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --configuration Release -warnaserror
dotnet test apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --configuration Release --no-build
```

## Assumptions and unresolved questions

- initial Field uses one monitor and fixed geometry,
- HMAC is foundation-level local binding, not complete VM attestation,
- process-name scopes will later need stronger executable identity,
- demonstration timestamps need a monotonic multi-stream clock design,
- key-name redaction is only one privacy layer,
- live recording needs a new privacy-critical audit,
- cross-language fixture is not yet added,
- Field registry is in-memory and not concurrency/persistence ready.

## Security and privacy impact

Positive:

- host access explicitly denied in Field policy,
- pilot cannot create policy/consent in the design,
- Field generations prevent stale authority reuse,
- attestation binds exact policy,
- recording requires consent,
- obvious secret-shaped fields are redacted,
- live recording and autonomy remain disabled.

Remaining risk:

- future recording and VM code are high-risk privacy/execution surfaces,
- no replay store or secure key storage yet,
- no visual/credential-field redaction implementation,
- no host/guest isolation evidence.

## Rollback and disable path

This slice adds disconnected modules and documentation. Rollback consists of removing the new source/tests/manuals and reverting root validator/manual references once added. No existing Glove runtime path depends on the Field foundation yet.

## Evidence level

- source: static inspection,
- tests: written but not executed,
- Windows/Hyper-V: none,
- ChatGPT MCP: none,
- owner acceptance: pending.

## Next recommended slice

1. Update root manuals and repository validator.
2. Run exact TypeScript/.NET validation and repair failures.
3. Add cross-language Field fixture.
4. Implement fake Field Manager and system pulse.
5. Create draft PR against `build/exosuit-mvp` with explicit evidence limits.
