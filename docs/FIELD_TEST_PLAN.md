# Exosuit Field Test Plan

**Status:** Foundation test plan; live runtime tests pending implementation  
**Created:** 2026-07-21T13:32:27-04:00

## Purpose

This plan proves the Exosuit Field independently from the Exosuit Glove while also proving their authenticated boundary. Tests must state which subsystem and evidence level they cover.

## Evidence vocabulary

| Level | Meaning |
|---|---|
| `static_inspection` | source, schema, or documentation review only |
| `typescript_unit` | deterministic TypeScript test without Windows/VM |
| `dotnet_unit` | deterministic .NET test without interactive Windows behavior |
| `fake_integration` | full contract path against fake Field or fake agent |
| `windows_guest_manual` | reproducible operator procedure inside a dedicated guest |
| `windows_guest_automated` | automation running inside a dedicated guest session |
| `hyperv_host_guest` | host provisioning and guest communication evidence |
| `chatgpt_mcp_connected` | normal ChatGPT MCP request reaches the reviewed Field path |
| `owner_accepted` | owner reviewed exact evidence and accepted promotion |
| `production_candidate` | packaging, operations, privacy, threat, performance, and rollback gates pass |

A test at one level does not prove a higher level.

## Foundation contract matrix

### Field identity

Positive:

- valid Field identity parses,
- `subsystem` equals `field`,
- positive generation accepted,
- optional personal-state digest accepted.

Negative:

- empty Field ID,
- generation zero or negative,
- `glove` used as Field subsystem,
- malformed image digest,
- empty session, machine, agent, or task-disk identity.

### Display contract

Positive:

- one monitor,
- 1920x1080,
- 100% scale,
- 100% browser zoom,
- fixed resolution.

Negative:

- multiple monitors in initial contract,
- dynamic resolution enabled,
- unsupported size or scale,
- empty keyboard layout.

### Policy

Positive:

- Teach policy with consent,
- Shadow policy with no recording capability,
- Pilot policy with bounded processes/capabilities,
- short expiry and finite budgets.

Negative:

- Teach without consent,
- duplicate processes or capabilities,
- expiry before issue,
- host desktop access true,
- host drive write true,
- privilege escalation true,
- security-control changes true,
- action or runtime budget outside bounds.

### Attestation

Positive:

- canonical policy hash,
- HMAC signature verification,
- exact Field generation binding,
- valid time window.

Negative:

- modified policy,
- wrong generation,
- wrong key,
- malformed signature,
- expired attestation,
- not-yet-valid attestation,
- expired policy,
- short attestation secret.

### Field lifecycle

Test every allowed edge:

```text
planned -> provisioning
planned -> destroyed
provisioning -> ready | faulted | stopping
ready -> teaching | shadowing | piloting | stopping | faulted
teaching | shadowing | piloting -> ready | stopping | faulted
stopping -> stopped | faulted
stopped -> provisioning | destroyed
faulted -> stopping | destroyed
```

Test forbidden direct edges, terminal destroyed state, repeated registration, stale generation, wrong Glove binding, and fault without reason.

### Demonstration episode

Positive:

- explicit consent,
- ordered events,
- all five source classes,
- completion and abort,
- source summary,
- artifact references,
- nested secret-shaped key redaction.

Negative:

- no consent,
- empty goal or success criteria,
- event after completion,
- timestamp regression,
- event overflow,
- malformed event source,
- end before start,
- secret classification without approved handling,
- cross-Field episode merge.

## Cross-language contract plan

Add `tests/fixtures/field-contract-v1.json` before Field Manager wiring. Both TypeScript and .NET must parse and validate:

- Field identity,
- display contract,
- policy subset shared with guest,
- lifecycle report,
- demonstration event metadata,
- fault report.

Required tests:

- TypeScript fixture parse,
- .NET fixture parse,
- enum wire-name agreement,
- date/time agreement,
- unknown-version rejection,
- missing-generation rejection.

## Field Manager fake integration

Before invoking Hyper-V, implement a fake manager with tests for:

- create planned Field,
- provision to ready,
- start mode,
- stop,
- destroy,
- increment generation after rebuild,
- preserve personal-state reference while replacing task disk,
- deny concurrent writers to the same Field generation,
- heartbeat expiry,
- policy/attestation mismatch,
- cancellation during provisioning,
- idempotent cleanup.

## Hyper-V host tests

Run only on a dedicated Windows host with virtualization enabled.

### Capability and preflight

- edition and Hyper-V capability detected,
- sufficient memory and disk,
- required virtual switch state,
- base image exists and hash matches,
- key material available without logging,
- no production host folders mapped writable.

### Provisioning

- create Generation 2 VM,
- attach immutable base image or differencing chain,
- attach personal-state disk read/write as designed,
- create and attach disposable task disk,
- configure memory/CPU within limits,
- start and wait for heartbeat,
- verify guest identity and display,
- issue short-lived attestation,
- stop and destroy cleanly.

### Failure cases

- missing base image,
- digest mismatch,
- insufficient disk,
- VM name collision,
- guest startup timeout,
- agent authentication failure,
- display mismatch,
- heartbeat loss,
- cancellation mid-provision,
- task disk cleanup failure,
- snapshot rollback causing generation change.

## Guest bootstrap tests

Inside the guest:

- agent starts automatically,
- directories created with expected permissions,
- Field identity persisted only where intended,
- display contract checked,
- unexpected startup windows reported,
- secure desktop or locked session blocks operation,
- task disk present,
- personal-state disk present only when policy allows,
- heartbeat identifies Field generation,
- emergency stop available before Pilot.

## Teach Mode tests

### Consent

- no hooks before explicit consent,
- task consent ends at episode completion,
- session consent ends on mode/lifecycle exit,
- consent cannot be granted through MCP/model text,
- visible recording indicator remains present,
- stop immediately unhooks recorders.

### Input events

- mouse sample timestamps monotonic,
- click down/up paired,
- wheel direction and amount preserved,
- drag path bounded,
- key down/up paired,
- focus identity recorded,
- credential fields suppress content,
- queue overflow fails closed,
- session lock stops recording.

### Visual events

- capture disabled by default,
- active-window/region scope enforced,
- frame budget enforced,
- raw bytes absent from normal audit,
- redaction applied before persistence,
- blank/protected surface reported,
- disposal/retention policy honored.

### Semantic and system events

- active window and focus changes,
- UI Automation structure changes,
- process launch/exit,
- file create/rename/download completion,
- modal appearance,
- inaccessible element warning,
- timestamp alignment with input stream.

## Shadow Mode tests

- no input APIs called,
- prediction tied to exact observation and Field generation,
- prediction includes intent, target, method, timing class, expected result, and confidence,
- actual action aligned to prediction,
- incorrect predictions preserved,
- correction feedback stored separately,
- privacy redaction remains active,
- prediction timeout does not block owner input.

Similarity metrics:

- next-intent agreement,
- target agreement,
- mouse-versus-keyboard agreement,
- workflow-order edit distance,
- timing error by context,
- cursor trajectory distance,
- scroll-distribution difference,
- typing interval distribution,
- correction behavior agreement.

## Learned motor tests

Pure tests:

- output stays within target/window bounds,
- finite coordinates and timestamps,
- maximum duration/steps enforced,
- deterministic seed option for tests,
- cancellation at every segment,
- fallback to reviewed deterministic motor,
- invalid profile rejected.

Guest tests:

- cursor path executes inside guest only,
- host cursor unaffected,
- focus change interrupts,
- target movement invalidates action,
- emergency stop latency measured,
- click/drag/scroll verify expected result.

Similarity is secondary to correctness, scope, and interruption.

## Pilot Mode tests

### Boundary

- valid attestation required,
- exact policy hash required,
- exact generation and session required,
- process and capability scope enforced,
- action/runtime budgets enforced,
- policy expiry stops new actions,
- model cannot modify policy,
- host desktop remains inaccessible.

### Workflow

- launch ordinary browser through desktop controls,
- navigate with keyboard/mouse and UI Automation/vision,
- handle popup,
- inspect results,
- download a harmless fixture,
- organize files in Workspace,
- export verified artifact to Outbox,
- stop without duplicate external effect.

No DOM, Playwright, or browser extension is required for this acceptance task.

### Recovery

- unexpected focus,
- page/layout change,
- slow load,
- application restart,
- download timeout after possible completion,
- agent disconnect,
- VM suspend/resume,
- task-disk rollback,
- supervisor restart,
- emergency stop mid-input.

## Isolation tests

- guest agent operates inside guest session,
- VM viewer is not used as primary input route,
- guest cannot access arbitrary host filesystem,
- guest cannot reach host LAN unless explicitly allowed,
- artifact broker enforces direction, size, hash, classification,
- clipboard disabled or separately bounded,
- host credentials absent from guest,
- separate Field generations cannot read each other's task disks,
- stop-all reaches every available Field and reports unreachable ones.

## Security and privacy tests

- secret-shaped values never appear in logs,
- HMAC key never appears in support bundle,
- demonstration deletion removes retrieval index references,
- consent records tamper evident,
- malformed episode rejected,
- frame data retention verified,
- symlink/path traversal rejected by future artifact broker,
- untrusted document/site text cannot change policy,
- generated communication actor is recorded,
- no hidden recording after mode exit.

## Performance measurements

Do not set release targets until real benchmarks exist. Measure:

- guest ready latency,
- observation latency,
- UIA event throughput,
- visual frame processing latency,
- input recording loss rate,
- scene graph update latency,
- local motor cancellation latency,
- MCP-to-action latency,
- task completion time,
- memory/CPU/disk use,
- demonstration storage growth,
- p50/p95/p99 per operation.

## Required validation commands for this foundation slice

```bash
npm install --ignore-scripts
npm run validate:repository
npm run typecheck
npm test -- --reporter=verbose
npm run build
npm run test:pulse -- --reporter=verbose
```

On Windows:

```powershell
dotnet restore apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj
dotnet build apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --configuration Release -warnaserror
dotnet test apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --configuration Release --no-build
```

## Promotion gates

### Field contract foundation

Requires TypeScript/.NET tests, repository validation, documentation, Parts traceability, and audit. No live claim.

### Field Manager GitHub validated

Requires fake manager and pure provisioning-plan tests. No Hyper-V claim.

### Windows Field validated

Requires exact host/guest acceptance evidence on a disposable VM.

### Teach validated

Requires consent, indicator, stop, privacy, event integrity, and owner review.

### Shadow validated

Requires no-input proof and defined similarity thresholds on selected tasks.

### Pilot validated

Requires complete verified fixture workflow, recovery, isolation, emergency stop, and owner review.

### Production candidate

Requires packaging, signing, upgrade/rollback, threat model, penetration test, performance gates, privacy operations, and support plan.
