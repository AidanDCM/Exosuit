# Field channel-secret protection command

## Goal, phase, and promotion gate

Add the next Phase 2 Field guest-environment dependency: one fixed LocalSystem
command that derives an exact seed-conversion transaction solely from validated
runtime configuration. This is source evidence only and does not pass the live
authenticated-channel, protected-runtime, rotation, or production gate.

## Ownership and authority impact

- Subsystem: Field guest environment.
- Environment authority: unchanged; exact LocalSystem is required before reads.
- Glove authority: unchanged.
- Pilot/model/MCP authority: none; no tool or transport surface is added.
- Generation: derived from the validated configuration and checked again by the
  converter/store. Rebuild or rollback mismatch denies.
- Policy/recording/export: unchanged; none can be created or expanded here.

## Files changed

- `apps/windows-agent/FieldChannelSecretProtectionCommand.cs`
- `apps/windows-agent/FieldChannelSecretSeedConverter.cs`
- `apps/windows-agent/FieldKvpRuntime.cs`
- `apps/windows-agent/Program.cs`
- `apps/windows-agent.Tests/FieldChannelSecretProtectionCommandTests.cs`
- master roadmap, Field architecture/status/developer manual/test plan
- Field threat model and failure-injection matrix
- the associated atomic audit and this engineering log

## Parts and donor patterns considered

The existing exact production Config root, runtime configuration contract,
LocalSystem assertion, injectable path inspector, fake-provider law, protected
store, and conversion receipt were reused. No donor code or donor test is
claimed as Exosuit evidence.

## Questions and assumptions

- The literal production path is intentionally stricter than normal Windows
  path equivalence; alternate case, separators, and dot segments deny.
- LocalSystem and administrators remain trusted. Source reparse checks do not
  prove resistance to a hostile concurrent namespace change.
- The fixed command is deliberately separate from startup so plaintext runtime
  compatibility cannot silently reintroduce fallback after conversion.

## Tests and commands actually run

- Focused Release `FieldChannelSecretProtectionCommandTests` with warnings as
  errors: PASS, 5/5, including the hardened exact-path and duplicate-property
  cases.
- repository, master-plan, and Field-contract validators: PASS;
- TypeScript typecheck and build: PASS;
- Field suite: PASS, 158/158; Field pulse: PASS, 1/1;
- full TypeScript suite: PASS, 330/330; Glove pulse: PASS, 1/1;
- .NET restore and Release warnings-as-errors build: PASS, zero warnings;
- full .NET suite: PASS, 69/69.

Exact-head results are recorded after execution; no live behavior is claimed by
these pre-commit runs.

## Field-specific failure answers

- Session lock, Secure Desktop, heartbeat loss, replay, overflow, uncertain
  effect, and emergency stop are unchanged because no action/runtime path calls
  this command.
- Converter failure stops without a success receipt. Recovery is a later exact-
  binding verification; plaintext is never restored after publication.
- Only one exact guest Config path is read. No host or other-Field data path is
  introduced.
- Source changes touch no immutable base, overlay, personal-state, or task disk.
  A future live call would change only the active generation's disposable OS
  overlay.
- Evidence is source/unit command-boundary evidence, not live isolation,
  recording, prediction, action execution, or guest proof.

## Security and privacy impact

The command line contains no Field/key/secret value except the fixed public
configuration path. Output is converter metadata only. Configuration contents,
secret bytes, private UI, recordings, and tokens are not logged.

## Rollback or disable path

Remove the command class, `Program` branch, converter interface, tests, and
documentation. No ordinary startup or provisioning caller depends on it.

## Next recommended slice

Add a protected-only runtime secret reader with exact generation/key/DACL checks
and no plaintext fallback. Only after its restart and failure matrix passes may
provisioning invoke the explicit protection command.
