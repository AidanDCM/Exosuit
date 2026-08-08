# Field secret startup transaction

## Goal, phase, and promotion gate

Complete the next Phase 2 Field guest-environment source dependency: convert or
verify the exact guest channel secret before starting the protected-only KVP
emitter, and validate a metadata-only receipt. This does not pass the live guest,
restart, failure-injection, rotation, or production gates.

## Ownership and authority impact

- Subsystem: Field guest environment.
- Environment authority: unchanged; the fixed launcher and both compiled
  boundaries require LocalSystem.
- Glove/host authority: unchanged.
- Pilot/model/MCP authority: none.
- Field generation/key: receipt must exactly match validated runtime values.
- Policy/recording/export: unchanged.

## Files changed

- `scripts/windows/Start-ExosuitFieldGuest.ps1`
- `tests/windowsFieldScripts.test.ts`
- master roadmap, Field architecture/status/developer manual/test plan/runbook
- Field threat model and failure-injection matrix
- the associated atomic audit and this engineering log

## Parts and donor patterns considered

The fixed launcher, exact runtime path, compiled protection command, metadata
receipt, protected reader, bounded error log, and fail-before-heartbeat law were
reused. No shell evaluation, new provider, donor code, or donor test was added.

## Questions and assumptions

- The compiled command writes exactly one receipt line only after successful
  conversion or exact already-protected verification.
- Receipt freshness allows five minutes of startup delay and 30 seconds of clock
  lead while rejecting retained output.
- LocalSystem and administrators remain trusted. Live service/process and
  filesystem concurrency remain unproven.
- Host-side verification uses separate host key material and is unchanged.

## Tests and commands actually run

- Windows PowerShell 5.1 parser on `Start-ExosuitFieldGuest.ps1`: PASS;
- focused Field suite: PASS, 158/158;
- repository, master-plan, and Field-contract validators: PASS;
- TypeScript typecheck and build: PASS;
- Field pulse: PASS, 1/1; full TypeScript suite: PASS, 330/330;
- Glove pulse: PASS, 1/1;
- .NET restore and Release warnings-as-errors build: PASS, zero warnings;
- full .NET suite: PASS, 74/74.

Exact-head results are recorded after execution; no live guest behavior is
claimed by these pre-commit runs.

## Field-specific failure answers

- Any protection or receipt failure stops before emitter invocation and should
  yield no heartbeat. Live observation of that behavior remains pending.
- A post-publication interruption reconciles on restart as already protected;
  plaintext is not restored.
- Session lock and Secure Desktop bootstrap behavior is unchanged. Heartbeat
  loss remains visible to the host; replay, overflow, uncertain desktop effects,
  and emergency stop are not part of this startup transaction.
- No host or other-Field data path is added.
- Source changes touch no disk. Live execution would mutate only the current
  disposable Field overlay's exact Config secret.
- Evidence is static/script integration, not live isolation, recording,
  prediction, desktop action, or guest execution proof.

## Security and privacy impact

The receipt contains only public binding/status/time/ciphertext-digest metadata
and is captured rather than logged. The runtime error file receives only command
stderr and generic launcher failures; it must not receive secret bytes or the
receipt. No UI, screenshot, recording, credential, or token data is added.

## Rollback or disable path

Revert the launcher/test/docs slice and deploy only the prior reviewed binary in
a new disposable development generation. Never restore plaintext fallback in a
production candidate.

## Next recommended slice

Build a process-injected startup harness that exercises conversion success,
already-protected restart, nonzero exit, malformed receipts, post-publication
interruption, and proof that the emitter is never invoked on denial. After that,
run the combined transaction under LocalSystem in a disposable guest.
