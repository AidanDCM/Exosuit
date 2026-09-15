# Protected Field guest KVP secret reader

## Goal, phase, and promotion gate

Add the next Phase 2 Field guest-environment dependency: make the guest KVP
emitter consume only the exact Field/generation/key-bound protected secret. This
is source evidence and does not pass startup, restart, live transport, rotation,
or production promotion gates.

## Ownership and authority impact

- Subsystem: Field guest environment.
- Environment authority: the guest emitter now independently requires its real
  process identity to be LocalSystem before configuration access.
- Glove and host-observer authority: unchanged.
- Pilot/model/MCP authority: none.
- Generation/key: exact values come from validated runtime configuration and are
  passed to the protected store; mismatch denies.
- Policy/recording/export: unchanged.

## Files changed

- `apps/windows-agent/ProtectedFieldKvpSecretReader.cs`
- `apps/windows-agent/FieldChannelSecretProtectionCommand.cs`
- `apps/windows-agent/FieldKvpRuntime.cs`
- `apps/windows-agent.Tests/ProtectedFieldKvpSecretReaderTests.cs`
- master roadmap, Field architecture/status/developer manual/test plan
- Field threat model and failure-injection matrix
- the associated atomic audit and this engineering log

## Parts and donor patterns considered

The existing exact production paths, LocalSystem assertion, path inspector,
strict bounded runtime-configuration loader, protected store interface,
DPAPI/DACL providers, runtime contract, and fake-provider pattern were reused.
The separate host/guest machine-protection domains were preserved. No donor
tests are claimed as Exosuit evidence.

## Questions and assumptions

- Printable ASCII remains the channel seed interoperability contract used by the
  conversion transaction and TypeScript/.NET authentication implementations.
- LocalSystem and administrators are trusted. Reparse checks are source-level
  defense and do not close concurrent filesystem TOCTOU risk.
- The host verifier retains a separate secret lifecycle. Guest DPAPI ciphertext
  is deliberately unusable by the host.
- Staging the protected reader before startup conversion intentionally causes a
  new binary with legacy plaintext provisioning to fail before heartbeat.

## Tests and commands actually run

- Focused Release `ProtectedFieldKvpSecretReaderTests` with warnings as errors:
  PASS, 5/5.
- combined focused command/reader suite: PASS, 10/10;
- repository, master-plan, and Field-contract validators: PASS;
- TypeScript typecheck and build: PASS;
- Field suite: PASS, 158/158; Field pulse: PASS, 1/1;
- full TypeScript suite: PASS, 330/330; Glove pulse: PASS, 1/1;
- .NET restore and Release warnings-as-errors build: PASS, zero warnings;
- full .NET suite: PASS, 74/74.

Exact-head results are recorded after execution; no live guest behavior is
claimed by these pre-commit runs.

## Field-specific failure answers

- Wrong SID, path, reparse endpoint, Field generation, key, DACL, envelope,
  ciphertext, or returned secret format denies before KVP publication.
- Session lock, Secure Desktop, heartbeat loss, replay, overflow, uncertain
  desktop effects, and emergency stop semantics are unchanged. A secret-load
  failure produces no heartbeat and the service supervisor observes child exit.
- No host or other-Field file path is accepted. The host observer remains a
  separate boundary.
- Source changes touch no base, overlay, personal-state, or task disk. A future
  live read touches the current generation's Config file without modifying it.
- Evidence is source/unit reader evidence, not live isolation, prediction,
  recording, action execution, or guest proof.

## Security and privacy impact

The guest emitter no longer reads plaintext channel-secret file content. Loaded
bytes are zeroed at termination and invalid store output is zeroed immediately.
The current managed authentication string remains a documented residual risk.
No secret, path contents, private UI, recording, screenshot, or token is logged.

## Rollback or disable path

For source development, revert the reader and emitter changes. For a deployed
Field, roll back to the prior reviewed binary in a new disposable generation;
do not reintroduce plaintext fallback into a production candidate.

## Next recommended slice

Add an explicit LocalSystem startup transaction that runs the fixed protection
command, verifies the resulting envelope, starts the protected-only emitter, and
fails before heartbeat on every conversion error. Then test restart idempotency
and pre/post-publication interruption with fake processes before any live guest.
