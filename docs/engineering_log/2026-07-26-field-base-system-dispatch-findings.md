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
`Set-Date`.

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
| Guest SYSTEM dispatch | 10 | Zero lines ever executed |
| Guest time correctness | 0 | Confirmed broken, unfixed |
| Sysprep / seal / receipt | 0 | Never reached |
| Field generation lifecycle | 5 | Depends on a v12 that does not exist |
| Runtime proofs (channel, heartbeat, identity, display, policy, attestation) | 0 | Outside the L0 claim boundary |
| **Overall** | **~35** | Strong harness, unproven core |

The validator's own `claimBoundary` states it proves nothing about interactive
Hyper-V, Teach hooks, visual capture, learning, ChatGPT Field operation, or Pilot
execution. Production readiness being denied is correct.

## Questions for a reviewer

1. Is a one-use LocalSystem service the right mechanism at all, or should this
   restructure around OOBE + `SetupComplete.cmd`, which runs as SYSTEM natively
   and needs no dispatch trick?
2. Is the 3-hour guest clock skew a property of the v10 image, of this host's
   Hyper-V configuration, or of how v10 was originally captured? Knowing which
   determines whether the fix belongs in the image or the builder.
3. Why does `reg load` fail with `ERROR_FILENAME_EXCED_RANGE` against this
   offline hive with a 6-character key name, a short path, and transaction logs
   present? Solving this unlocks the offline timezone fix.
4. Does the stricter contract test in `dd55666` guard the right invariants? The
   security properties it encodes were chosen by an agent, not by an owner.

## Bottom line

The repository is validated and the harness is sound. The product is unproven.
The gap is one Windows boundary, and after ten attempts it is characterised well
enough to hand to someone else without loss of context — which was not true this
morning.
