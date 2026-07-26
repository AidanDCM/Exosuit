# Field base v12 SYSTEM dispatch — consolidated findings

**Date:** 2026-07-26
**Branch:** `codex/issue-20-personal-disk-identity`
**Head at write time:** `3857da1`
**Status:** blocked. No v12 has been promoted. No false claim of success has been recorded.

## Purpose

This is a handover document, not a progress report. Ten build attempts have failed
at one boundary. Four separate root-cause hypotheses were stated with confidence
and each was subsequently disproved by evidence. This records what is *proven*,
what is *disproved*, and what remains genuinely unknown, so that a reviewer can
weigh in without repeating the work.

## The boundary

Everything up to and including Windows Audit Mode works. Everything past the point
where a SYSTEM process must run has never worked once.

```
Host validates exact commit  ✔ proven
Clone immutable v10          ✔ proven
Inject scripts + auth        ✔ proven
Boot zero-network VM         ✔ proven
Windows enters Audit Mode    ✔ proven
auditUser bootstrap runs     ✔ proven
─────────────────────────────────────  ← every attempt stops here
SYSTEM maintenance executes  ✘ never once
Receipt written              ✘ never
Sysprep + shutdown           ✘ never
Host verifies and promotes   ✘ never
```

The single most important fact: **`maintenance-stage.txt` has never been written.**
It is the first executable statement of `Invoke-ExosuitFieldBaseMaintenance.ps1`
(`Set-MaintenanceStage 'started'`). Its absence across every attempt and every
dispatch mechanism means the maintenance script has never executed one line.

## Disproved hypotheses

Each of these was stated as the cause, acted on, and refuted. Recording them
matters more than the fixes, because each cost a ~30 minute cycle.

### 1. The SYSTEM principal was being mutated

**Claim:** `Set-ScheduledTask` rewrote the native `/RU SYSTEM` task to
`InteractiveToken`, so it never dispatched.

**Refuted by:** the bootstrap's own live read in the `51fa83a` run recorded
`principalUserId=SYSTEM`, `principalLogonType=ServiceAccount`, `state=Queued`.
The principal was already correct while the task was queued. `8b53846` removed the
mutation and behaved identically. The `InteractiveToken` string appeared only in
the exported on-disk XML, which disagrees with `Get-ScheduledTask` as a normal
artifact for `S-1-5-18` tasks.

**Real status:** the mutation was real but not causal.

### 2. Task Scheduler could dispatch SYSTEM if the task were correct

**Refuted by:** `8b53846` registered `UserId=S-1-5-18` with no `LogonType`
element, `schtasks /Run` returned 0, `lastResult=0`, and the task sat at
`state=Queued` for the full 25 minutes. Additionally its only trigger was a
`BootTrigger` whose `StartBoundary` (`15:26:00`) had already passed when the task
was registered (`15:26:04`) on an already-booted machine.

**Conclusion:** Task Scheduler does not dispatch during Audit Mode regardless of
principal. Abandoned.

### 3. `auditSystem` would run the command natively as SYSTEM

**Claim:** the `auditSystem` pass runs in SYSTEM context, so it avoids the
dispatch problem entirely. An earlier note had said the setting was invalid there;
that note was treated as untested rather than proved.

**Refuted by:** two attempts, `RunAsynchronous` then `RunSynchronous`. Both times
Panther logged the pass executing:

```
Found usable unattend file for pass [auditSystem]
[SETUPUGC.EXE] SetupUGC running to process unattend settings for pass [auditSystem]
Successfully completed RunSMIPass for auditSystem.
```

and in neither case was a `Found RunSynchronous command:` line emitted. The only
such lines belong to the `auditUser` block. The pass runs and dispatches nothing.

**Conclusion:** on build 26100, `Microsoft-Windows-Deployment` commands are not
dispatched in `auditSystem`. The original note was correct. Section removed.

### 4. The service image path was mangled

**Claim:** embedded quotes plus a relatively-named `powershell.exe` were being
corrupted between PowerShell, `sc.exe` and the SCM.

**Refuted by:** `949ee06` stored the path verbatim and correct:

```
servicePathName=C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\Exosuit\Agent\Invoke-ExosuitFieldBaseMaintenance.ps1
serviceStartExitCode=1053   serviceExitCode=0   serviceProcessId=0
```

**Real cause:** `1053` is the SCM start timeout. PowerShell never calls
`StartServiceCtrlDispatcher`, so the SCM was always going to fail the start and
then terminate the process it created. Every service attempt was doomed
identically regardless of path formatting.

### 5. `cmd /c start /b` would detach the process from the SCM

**Refuted by:** SCM event `7009` — *"A timeout was reached (30000 milliseconds)
while waiting for the ExosuitFieldBaseMaintenance service to connect"*. Had `start
/b` returned immediately, the SCM would have reported a process that started and
stopped, not a 30 second wait. `start /b` requires a console; a service in
session 0 has none, so the detachment silently did nothing.

## Proven facts

- The `auditUser` bootstrap **does** execute, as the built-in administrator, and
  completes in ~18 seconds. Panther confirms `Finished executing ... synchronously`.
- A service **is** created correctly. SCM event `7045` records
  `Service Account: LocalSystem`, `demand start`, with the exact reviewed command.
- The SCM **does** attempt the start, waits 30 s, fails with `1053`, and kills the
  process (`7000` + `7009`).
- Task Scheduler leaves tasks `Queued` for the entire Audit Mode session.
- The repository itself is green: L0 passes 15/15 on `3857da1` including 240
  TypeScript tests, 44 .NET tests, both system pulses, and the host capability
  check.

## Open unknown — the critical one

**Does the SCM ever actually create the dispatched process?**

`1053` with `7009` implies a process was created and failed to connect. But if a
process ran for 30 seconds, PowerShell had ample time to write
`maintenance-stage.txt`, and it never did. These two facts are in tension and
cannot both be explained by any hypothesis tested so far.

`3857da1` instruments exactly this. `Dispatch-ExosuitFieldBaseMaintenance.cmd`
writes `maintenance-dispatch.txt` as its first action, before anything can fail,
and captures the maintenance process's own output to `maintenance-dispatch.log`.

| Outcome | Meaning | Next move |
|---|---|---|
| No marker | SCM never creates the process in Audit Mode; the service route is dead | Offline registry route, or restructure around OOBE + `SetupComplete.cmd`, which does run as SYSTEM |
| Marker, no stage file | PowerShell launches and dies before its first line — session 0 environment problem | Read `maintenance-dispatch.log` for the actual error |
| Marker + stage file | Boundary crossed | Fix whatever stage it stopped at |

### Attempt 11 was void — it tested nothing

The `3857da1` build timed out with no marker, no dispatch log and no stage file,
but **that result carries no information.** The bootstrap rejected its own
registration and threw before `sc start` was reached:

```
servicePathName=C:\Windows\System32\cmd.exe /c C:\Exosuit\Agent\Dispatch-ExosuitFieldBaseMaintenance.cmd
serviceExitCode=1077   (ERROR_SERVICE_NEVER_STARTED)
error=Field base maintenance service registration did not preserve the reviewed
      SYSTEM identity and fixed-action contract.
```

The `binPath` was changed to the shim while the contract check still asserted the
path contained `Invoke-ExosuitFieldBaseMaintenance.ps1`, which the shim's path
does not. SCM event `7045` records the service installed; there is no `7000` or
`7009` because no start was attempted. Fixed in `Invoke-...Bootstrap.ps1` by
asserting the shim the image path actually names, and locked by test.

**The critical unknown above remains completely open.** The absence of the marker
in this attempt means nothing.

## RESOLVED — SYSTEM dispatch works

Commit `920926a`. The boundary described above is crossed. Evidence:

```
dispatchedAtLocal=Sun 07/26/2026 19:09:37.51
dispatchUser=WIN-4ODEDCOECCV$        <- machine account, i.e. LocalSystem
stage=system_identity_verified
```

`Invoke-ExosuitFieldBaseMaintenance.ps1` executed and passed its own independent
`S-1-5-18` check. The working mechanism is:

1. `auditUser` `RunSynchronousCommand` runs the bootstrap as the built-in admin.
2. The bootstrap creates a one-use `LocalSystem` service whose image path is
   `cmd.exe /c C:\Exosuit\Agent\Dispatch-ExosuitFieldBaseMaintenance.cmd`.
3. `sc start` returns `1053` — expected and harmless, since cmd is not a service
   binary. The SCM kills the service process; the shim's work is already done.
4. The shim records that it ran before anything can fail, then invokes the
   maintenance script.

`1053` is the normal outcome here and must not be read as failure.

## Second, independent blocker — guest clock

Measured directly, same machine, same instant:

```
localObservedAt=2026-07-26T18:01:26-07:00
observedAt     =2026-07-27T01:01:26Z
```

Guest local time matches host local time, but the guest applies a **−07:00** bias,
so its computed UTC runs **3 hours ahead** of true UTC. The host stamps
`expiresAt = UtcNow + 2h`, so **every authorization is already expired by roughly
an hour before the VM finishes booting.**

This has never fired because maintenance never runs. It will fire the moment
dispatch succeeds.

Attempted: enabling `Time Synchronization` on the VM (no effect), then forcing
`vmictimesync` to run inside the guest before dispatch — `timeSyncState=Running`
was achieved, but whether the clock moved is not yet known, because the guest has
no host reference to compare against.

**Untried and believed correct:** edit `TimeZoneInformation` in the offline SYSTEM
hive during staging. Windows derives system UTC from the RTC at boot as
`RTC + bias`; the guest RTC holds host *local* time, so setting the bias to −04:00
offline yields correct UTC at boot. Note this works only offline — `tzutil` on a
running system shifts displayed local time against an already-fixed UTC and does
**not** correct this. Blocked on `reg load` failing with
`ERROR_FILENAME_EXCED_RANGE` against this hive, which is itself unexplained.

**Deliberately not done:** seeding the guest clock from `issuedAtUtc` in the
authorization. That would make expiry unfailable and void its purpose as replay
protection. A test now asserts the bootstrap references neither `expiresAt` nor
`Set-Date`. Note that the `920926a` run would have produced a green v12 had this
shortcut been taken, with expiry silently dead. The refusal was correct.

### Mechanism, now fully established

```
guest local  = 19:10   (identical to host local)
guest offset = -07:00
guest UTC    = 02:10   (true host UTC 23:10)
```

The VM's RTC carries **host local time**, and the guest converts it to UTC using
its own Pacific bias. The 3 hour error is exactly EDT minus PDT. Aligning the
guest timezone to the host's therefore corrects UTC exactly, with no clock
writing and no dependency on the authorization.

**The constraint that makes this a design decision:** Windows derives system UTC
from `RTC + bias` once at boot and then runs on its own tick. Changing the
timezone on a running guest shifts displayed local time and cannot retroactively
repair UTC. The timezone must therefore be correct *before a boot*.

### Offline servicing — cause still unknown, earlier theory disproved

An earlier draft of this document hypothesised that the v10 hives were dirty and
that this explained both failures. **That is disproved.** Probe results
(`v10-offline-serviceability.txt`, read-only against v10):

- `Sysprep_succeeded.tag` present, no `pending.xml`, no `reboot.xml` — v10 is a
  cleanly sysprepped image.
- `SYSTEM.LOG1` is 0 bytes with logs dated from the original 2024 install,
  consistent with cleanly flushed hives.
- `reg load` fails with `ERROR_FILENAME_EXCED_RANGE` identically for both SYSTEM
  (10MB) and SOFTWARE (71MB), on fresh copies at a 40 character path with a
  6 character key name. A failure invariant to hive, path and key name is not a
  property of the hive.
- Command-line quoting was also ruled out: direct and `cmd /c` invocations both
  parse the path and reach the privilege check identically.
- The probe's own DISM checks returned `1639` (`ERROR_INVALID_COMMAND_LINE`) from
  a malformed probe command line and tested nothing. The builder's original
  failure was different: error `87`, with `get_OSVersion` failing at
  `HRESULT=0x80070057`.

So offline registry servicing fails for a reason not yet identified, and it is
not image corruption.

### Two candidate long-term fixes

1. **Set the timezone in the guest, then reboot the VM.** Audit Mode persists
   across reboots, and on the second boot Windows recomputes UTC from
   `RTC + corrected bias`. Dispatch would move to an auto-start service, which is
   the same mechanism already proven to work. Needs no offline registry access.
   Cost: restructures the boot flow.
2. **Fix the v10 base image's timezone once**, so every future generation
   inherits it. Cleanest conceptually and removes the problem permanently, but
   requires either offline servicing (currently failing) or booting the immutable
   base, which its read-only design exists to prevent.

Option 1 uses only proven mechanisms. Option 2 is the better end state. They are
not exclusive: 1 unblocks v12 now, 2 belongs on the roadmap.

## Repository changes made today

| Commit | Change | Confidence |
|---|---|---|
| `2e2cb6b` | Dual-route SYSTEM dispatch, mechanism-agnostic consumption | superseded |
| `a43dae2` | Validator judges steps by exit code, not stderr | **high — real defect fixed** |
| `dd55666` | Contract test moved to service dispatch, made stricter | needs review |
| `949ee06` | Absolute, unquoted service image path | correct but not the fix |
| `3eddc41` | Detach via `cmd /c start /b`; remove dead `auditSystem` section | detach failed; removal correct |
| `81ca7ec` | Force `vmictimesync` before dispatch | unverified |
| `3857da1` | Fixed dispatch shim with pre-failure marker | diagnostic |

`a43dae2` deserves separate attention: `Invoke-ValidationStep` merged native
stderr into the PowerShell stream under `ErrorActionPreference='Stop'`, so any
tool writing a notice to stderr failed the step regardless of exit code. An
`npm ci` that reported *"added 146 packages"* was recorded as a blocking failure.
Earlier green runs passed partly because npm happened not to print a notice. **Any
L0 result from before this commit should be treated as noisy in both directions.**

## Production readiness

| Aspect | % | Basis |
|---|---|---|
| Repository source & unit tests | 90 | L0 15/15, verified |
| CI / exact-commit gating | 85 | Enforced and exercised repeatedly today |
| Security & authorization model | 80 | Well designed, fail-closed, still never exercised end to end |
| Host build pipeline | 75 | Reliable through VM boot |
| Evidence collection | 75 | Substantially improved today |
| Image promotion & hash verification | 40 | Code complete, has never executed |
| Guest SYSTEM dispatch | 70 | Proven working as LocalSystem; reached `system_identity_verified` |
| Guest time correctness | 15 | Mechanism fully understood, fix designed, not implemented |
| Sysprep / seal / receipt | 0 | Never reached |
| Field generation lifecycle | 5 | Depends on a v12 that does not exist |
| Runtime proofs (channel, heartbeat, identity, display, policy, attestation) | 0 | Outside the L0 claim boundary |
| **Overall** | **~42** | Harness strong, SYSTEM boundary crossed, seal still unproven |

The validator's own `claimBoundary` states it proves nothing about interactive
Hyper-V, Teach hooks, visual capture, learning, ChatGPT Field operation, or Pilot
execution. Production readiness being denied is correct.

## Questions for a reviewer

1. Reboot-then-dispatch (option 1) or fix the base image's timezone (option 2)?
   Option 1 unblocks v12 with proven mechanisms; option 2 removes the class of
   problem but conflicts with v10 being immutable and read-only by design.
2. Is relying on `1053` plus a shim that outlives its own service acceptable as
   a durable mechanism, or is it a workaround that should be replaced once v12
   exists? It works, but it depends on the SCM killing only the process it
   created.
3. Why does `reg load` fail with `ERROR_FILENAME_EXCED_RANGE` invariant to hive,
   path and key name, and why does DISM fail at `get_OSVersion` with
   `0x80070057`, on an image that is demonstrably clean? Unexplained, and it
   blocks all offline servicing for every future image operation, not just this
   timezone fix.
4. Does the stricter contract test in `dd55666` guard the right invariants? The
   security properties it encodes were chosen by an agent, not by an owner. This
   now includes the assertion that the bootstrap may not call `Set-Date`, which
   directly constrains which clock fixes are permissible.

## Bottom line

The SYSTEM dispatch boundary is crossed and proven. One blocker remains, the
guest clock, and its mechanism is now fully understood rather than guessed: the
VM's RTC carries host local time and the image's timezone differs from the host's.
Two fixes are designed; neither is implemented.

Progress today came from instrumenting rather than inferring. The four wrong root
causes were all reached by reasoning from absent output; the boundary fell within
one attempt of a marker being written before anything could fail. That is the
lesson worth carrying into the remaining work.

Nothing has been promoted, no gate has been loosened, and every refusal recorded
here was the security model behaving correctly.
