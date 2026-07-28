# Engineering Log — Field Foundation Expansion

**Date:** 2026-07-21  
**Branch:** `agent/field-foundation`  
**Draft PR:** #11  
**Parent log:** `2026-07-21-glove-field-foundation.md`

## Goal

Continue the Field build beyond static identity/contracts while preserving the Glove/Field split and avoiding unreviewed Hyper-V, recording, or autonomous execution code.

## Implemented

### Typed fake Field Manager

- `FieldProvisioner` interface
- fake provider
- plan, provision, mode entry/exit, stop, destroy
- exact attestation verification
- provisioned-policy hash binding at mode entry
- policy expiry checks
- visible fault state
- hash-linked Field audit
- complete fake lifecycle pulse tests

### Cross-language Field fixture

- shared identity, display, lifecycle, and demonstration-event JSON
- TypeScript fixture test
- .NET fixture test
- test project copies fixture to output

### Encrypted demonstration persistence

- terminal episode requirement
- second redaction pass
- raw screenshot/frame byte-field denial
- AES-256-GCM envelope
- episode and Field identity authenticated data
- atomic file replacement
- size limits
- wrong-key/corrupt-file hiding from listing
- episode and Field-generation deletion
- tamper, privacy, deletion, and round-trip tests

### Field scene graph

- Field-bound versioned snapshots
- active-window consistency
- window/element/modal identity
- cursor geometry
- secure/locked/busy readiness gates
- incremental window/focus/modal/system/display/element events
- stale/cross-generation and unsafe-state tests

### Shadow evaluation foundation

- prediction records with literal `executionAllowed: false`
- actual owner-action records
- same observation and Field-generation requirement
- intent, target, method, expected-result, timing, and trajectory-shape comparison
- session aggregate metrics
- duplicate and cross-generation denial tests

### Deterministic VM provisioning plan

- strict Hyper-V Generation 2 desired-state contract
- CPU and memory bounds
- secure boot and no nested virtualization
- immutable base image
- encrypted personal-state disk
- disposable task disk
- isolated/disabled/filtered-NAT network
- host LAN/inbound false
- clipboard/broad drive/host input false
- required ordered steps through guest ready
- integrity hash and tamper tests
- no shell or arbitrary command field

### Windows path scope and artifact broker

- adapted Parts & Pieces path-scope pattern
- drive/UNC/traversal/ADS/reserved-name/invalid-character rejection
- trailing-dot/space and ambiguous-segment rejection
- required reparse inspection
- direction-specific Field roots
- transfer manifest with exact length and SHA-256
- sensitive/untrusted ordinary export denial
- prepared/verified/completed/cancelled/failed lifecycle
- constant-time hash comparison

## Parts & Pieces application

- Atomic Audit addendum written
- Question/assumption review extended
- path-scope donor inspected directly and adapted rather than copied blindly
- typed command-broker pattern used for provisioning plan/manager
- evidence-source discipline applied to hosted failures
- path scope made a hard prerequisite before live transfer
- audit/event separation kept between Glove and Field

## Hosted validation evidence

For branch head `a34deaccb458c8b6b364f3b250ba174a21faecb1` at the time checked:

- Exosuit CI run `29854178787`: failed with all three jobs showing zero steps.
- Security Audit run `29854178777`: failed before repository steps.
- job log retrieval returned no blob because no steps ran.

Classification: hosted runner/account block. No test was proven passing or failing.

Subsequent commits require another validation check.

## Static defects found and repaired during the pass

- removed a clock-dependent demonstration completion test,
- separated timestamp-order and overflow assertions,
- made .NET nullable fault assertion explicit,
- changed signature corruption test to use a deterministic wrong key,
- bound Field mode entry to the exact provisioned policy hash,
- added policy expiry enforcement,
- fixed Shadow no-execution test to validate the literal schema,
- routed scene validation tests through the graph rather than schema-only parsing,
- tightened active-window and display-bound invariants.

## Tests written but not executed

- Field Manager lifecycle/policy/fault/audit
- cross-language fixture
- encrypted demonstration storage/tamper/deletion
- scene graph events/readiness
- Shadow comparisons/metrics/no-execution
- provisioning-plan integrity/isolation
- path scope/reparse requirement
- artifact broker hashes/states/classification

Existing repository TypeScript/.NET suites must execute before promotion.

## Security and privacy posture

No live Hyper-V provider, input hook, visual capture, MCP Field tool, personal model, credential broker, or Pilot runtime was introduced.

New protections are source-level foundations only. They do not prove isolation or privacy on a real Windows host.

## Rollback

All new modules are disconnected from the existing Glove runtime. Revert their commits and validator/manual references to remove the Field expansion without altering current Glove execution paths.

## Remaining highest-priority work

1. run exact commands on a usable Windows/local runner,
2. repair confirmed compile/test failures,
3. persist/hydrate Field Manager registry and audit,
4. implement a dry-run then supported Hyper-V provider,
5. create guest bootstrap and heartbeat,
6. perform privacy-critical audit before input/visual hooks,
7. implement Teach recorder and deletion operations,
8. produce live scene graph,
9. implement actual Shadow retrieval/prediction with no-input proof,
10. integrate bounded Pilot only after all earlier evidence.
