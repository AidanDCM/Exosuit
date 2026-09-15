# The scene producer process that was never there

- **Goal:** find out what the launcher actually starts. It was not a producer.
- **Files changed:** `FieldSceneProducerHost` (new), `--field-scene-producer` in `Program`, the
  launcher now passes a command line and requires a producer configuration, `FieldSceneSession`
  writes that configuration before launching, tests, this log.

## What was wrong

`FieldSceneProducerLauncher` called `CreateProcessAsUser(image, commandLine: null, …)`. With no
arguments, `Program.Main` falls through to `AgentHost.RunAsync` — the general agent host. And
nothing anywhere called `FieldSceneProducerClient`; it had zero callers.

So on a live guest: the launcher starts a process, the launch reports success, SCN-001.L1 looks
like it passed, and the intake waits forever for a connection that never comes. L2 would time out
with no scene and no error pointing at the cause.

**A failure that presents as partial success is worse than a crash.** The runbook's
failure-prediction list did not include this either, which is now twice that list has missed
something the fixtures and the wiring found instead.

## What was built

`FieldSceneProducerHost` — observe, sanitize through the producer boundary, send one frame, wait,
repeat. Plus `--field-scene-producer <config>`, and the launcher now passes it.

The configuration carries no secret. The producer never signs; it hands bytes to the privileged
relay, which re-derives every fact from Windows before an envelope exists. Its only privilege is
seeing the desktop it runs on.

## Two decisions worth keeping

**The producer's capability is observe-only, by type.** It takes `IFieldSceneObserver`, not
`IDesktopProvider` — the latter also exposes `ExecuteAsync`, `VerifyAsync` and `CancelAsync`.
Handing the producer a type that can act would give it authority it has no business holding, and
"it never calls those" is a property of today's code rather than of the design. Acting is now
unreachable rather than merely unused.

**A transport failure ends the loop rather than retrying.** The supervisor already relaunches a
dead producer and already invalidates readiness when one dies. A producer that quietly retried
would hide exactly the condition the supervisor exists to notice, and a scene that may or may not
have been delivered is the blind retry the safety rules forbid. A test pins the attempt count at
one.

The launcher now *refuses* to start without a configuration file present, so the original failure
mode — a producer running in the wrong mode — cannot recur silently.

## Cursor and modal are reported absent, not invented

Neither is part of a desktop observation. A fabricated cursor position would be indistinguishable
from a real one downstream, and a claimed modal would let the host deny a legitimate action. Both
are reported as absent until something actually observes them.

## Results

- Agent suite **274/274**, up from 259.
- `validate:repository`, `validate:field-contract` pass.
- Gate unchanged: SCN-001 `source_validated`.

## Still unproven

`WindowsUiAutomationProvider` has never run under this host, so what a real observation contains —
element counts, whether it stays inside the 12 KiB structural bound on a busy desktop, how long it
takes — is unknown. The 12 KiB bound is the most likely first failure: a real desktop with many
windows may not fit, and the producer boundary rejects rather than truncates. That belongs on the
runbook's prediction list and is now on it.
