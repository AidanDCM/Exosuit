# Field base v12 SYSTEM dispatch — consolidated findings

**Date:** 2026-07-26 into 2026-07-27
**Branch:** `codex/issue-20-personal-disk-identity`
**Final commit:** `6622371`
**Status:** RESOLVED. `exosuit-field-base-v12.vhdx` is built, sealed and promoted.

## Result

```
success:      true
sourceCommit: 66223716358645011a095bace9fd0b41a13274dd
startedAt:    2026-07-27T04:50:52Z
completedAt:  2026-07-27T04:57:15Z      (6m23s end to end)
target:       C:\ProgramData\Exosuit\Images\exosuit-field-base-v12.vhdx
sha256:       6fdb1b2d969d8bb6c8a4f4c6ee34925c855a1a49c5624f9f6ad318ada1819ced
readOnly:     true
```

Verified independently of the builder's own record by recomputing the target
hash on the host: match. The immutable v10 source is untouched and still
read-only.

Receipt gates, all passed: `systemIdentity`, `networkDetached`,
`nonBuiltInLocalAccountsAbsent`, `perGenerationConfigurationAbsent`,
`authorizationConsumed`, `bootstrapUnattendConsumed`, `maintenanceTaskConsumed`.
Account `Aidan` (SID ending `-1001`) and its single profile were removed inside
the guest. Six components digested including `Exosuit.Agent.exe`. Sysprep ran
`/generalize /oobe /shutdown /quiet`.

**No gate was loosened to reach this.** The available shortcut — seeding the
guest clock from `issuedAtUtc` in the authorization — would have produced a
green v12 several hours earlier with expiry silently dead as replay protection.
It was declined each time it came up. That refusal is why the receipt means
something.

## The working mechanism

```
auditUser RunSynchronousCommand
  └─ bootstrap, as built-in administrator
       ├─ capture local wall time (host-derived, correct)
       ├─ tzutil /s <host timezone from image config>
       ├─ Set-Date <captured local time>        → UTC now correct
       ├─ sc create ... obj= LocalSystem, image = dispatch shim
       └─ sc start  → 1053 expected, SCM kills the shim
            └─ shim, as LocalSystem
                 ├─ write dispatch marker before anything can fail
                 └─ Win32_Process.Create → maintenance, parented to WMI host
                      └─ survives the SCM kill, runs to Sysprep and shutdown
```

Two properties make this work and are easy to break:

- The maintenance process must not be a descendant of the service process.
- The clock capture must precede the timezone change, and the restore must
  follow it. Any other order reproduces the fault exactly.

## Root causes, in the order they were found

Each was confirmed by evidence. Several earlier theories were stated with
confidence and later disproved; those are recorded below because the refutations
are what stop the work being repeated.

### 1. Task Scheduler never dispatches during Audit Mode

`8b53846` registered `UserId=S-1-5-18` with no `LogonType`, `schtasks /Run`
returned 0, `lastResult=0`, and the task sat `Queued` for the full 25 minutes.
Its only trigger was a `BootTrigger` whose `StartBoundary` had already passed.
Abandoned.

**Disproved along the way:** that `Set-ScheduledTask` was mutating the principal.
The bootstrap's own live read showed `principalUserId=SYSTEM`,
`principalLogonType=ServiceAccount` *while the task was queued*. The mutation was
real but never causal.

### 2. The auditSystem pass dispatches nothing on build 26100

Two attempts, `RunAsynchronous` then `RunSynchronous`. Panther both times:

```
Found usable unattend file for pass [auditSystem]
[SETUPUGC.EXE] SetupUGC running to process unattend settings for pass [auditSystem]
Successfully completed RunSMIPass for auditSystem.
```

and no `Found RunSynchronous command:` line, which the auditUser pass does emit.
The pass runs and dispatches nothing. Section removed.

### 3. The SCM kills a non-service binary *and its children* at 30 seconds

The decisive timeline, from `9224fb8`:

```
02:10:15.7  service created
02:10:20    shim dispatched
02:10:43.7  stage components_verified     ← last sign of life
02:10:49.9  SCM 7009: 30000 ms timeout reached
            nothing for the next 20 minutes
```

**Disproved along the way:** that the service image path was being mangled
(`949ee06` stored it verbatim and still failed), and that `cmd /c start /b`
would detach it (event 7009 proved the SCM waited the full 30 s, because
`start /b` needs a console and a session 0 service has none).

Fixed by creating the maintenance process through `Win32_Process.Create`, which
parents it to the WMI provider host. Confirmed: `spawnReturnValue=0`, shim exited
in 10 s, maintenance continued past it.

### 4. The guest RTC carries host local time

```
guest local  = 19:10   (identical to host local)
guest offset = -07:00
guest UTC    = 02:10   (true host UTC 23:10)
```

The image's timezone differed from the host's, so the guest converted a
host-local RTC with the wrong bias. Error was exactly EDT − PDT.

**Disproved along the way:** that Hyper-V Time Synchronization would fix it
(`vmictimesync` reached `Running`, clock did not move), and that a timezone
change plus reboot would fix it. The reboot attempt is worth recording because
every mechanism in it worked and the clock still did not move:

```
tzutil:   PST → EST.  Windows KEEPS UTC and recomputes local instead
shutdown: Windows writes the shifted local time back to the RTC
boot 2:   UTC = RTC + bias = the same wrong value
```

Windows derives UTC from `RTC + bias` once at boot and then runs on its own
tick, so the timezone must be right *before* a boot, or the clock must be
corrected after the bias changes. Offline correction was unavailable (below), so
the capture/align/restore sequence was used. Measured result: `04:35:50Z` →
`01:35:51Z`, and guest local matching host local again.

### 5. Windows Setup reserialises the answer file

The digest check could never have passed. Setup rewrites
`C:\Windows\Panther\Unattend.xml` in place: it drops comments, changes the XML
declaration from double to single quotes, and adds `wasPassProcessed="true"` to
each processed `settings` element.

Fixed by comparing the documents as canonical XML — comments and setup's own
bookkeeping attribute removed — on both sides. Passes, components and exact
command paths all remain covered. Verified *before* spending a build cycle: the
builder's answer file and a real post-setup file collected from a previous
attempt canonicalise to the same digest, `b2e91c5c`, which is exactly the value
that later appeared in the successful receipt.

## Self-inflicted failures

Recorded because they cost more cycles than Windows did.

| Fault | Cost |
|---|---|
| Contract check named the old command after the image path moved | 2 void attempts |
| `2>&1` on native commands under `ErrorActionPreference='Stop'` | 3 occurrences |
| `$PSScriptRoot` empty under `-File`, so `-RepositoryRoot` was empty | 1 L0 run |
| `%ERRORLEVEL%>>` parsed as a `1>>` redirect, swallowing the exit code | 1 attempt's evidence |
| `Get-Item` without `-Force` on Hidden+System hive logs | 1 probe |
| Dirty-hive hypothesis, asserted then disproved | nearly a base-image rebuild |

The registration/consumption divergence happened **twice**. It is now guarded by
a test that extracts the shim name from both files and asserts they are equal,
rather than asserting each in isolation — two independent checks can drift, one
comparison cannot.

## Still unexplained

Offline registry servicing fails against a demonstrably clean image
(`Sysprep_succeeded.tag` present, no `pending.xml`, hive logs consistent with a
clean flush):

- `dism /Set-TimeZone` → error 87, `get_OSVersion` failing at `0x80070057`
- `reg load` → `ERROR_FILENAME_EXCED_RANGE`, invariant to hive (10MB and 71MB),
  path, and key name; command-line quoting ruled out

This did not block v12 because the clock is corrected in-guest instead, but it
blocks *all* offline image servicing and will matter for future image work.

## Production readiness

| Aspect | Before | After | Basis |
|---|---|---|---|
| Repository source & unit tests | 90 | 90 | L0 15/15, and now trustworthy after `a43dae2` |
| CI / exact-commit gating | 85 | 90 | Exercised heavily; refused every mismatched head |
| Security & authorization model | 80 | 90 | Exercised end to end and it fail-closed correctly throughout |
| Host build pipeline | 75 | 90 | Ran to completion including promotion |
| Evidence collection | 70 | 90 | Names the failing stage without inference |
| Guest SYSTEM dispatch | 10 | 95 | Proven repeatedly |
| Guest time correctness | 0 | 85 | Corrected in-guest; image itself still carries the wrong zone |
| Image promotion & hash verification | 40 | 95 | Executed and independently re-verified |
| Sysprep / seal / receipt | 0 | 90 | Full receipt, all gates passed |
| Field generation lifecycle | 5 | 20 | Unblocked, not started |
| Runtime proofs (channel, heartbeat, identity, display, policy, attestation) | 0 | 0 | Outside the L0 claim boundary |
| **Overall** | **~35** | **~65** | |

Production readiness remains denied, correctly. The validator's `claimBoundary`
still states that L0 proves nothing about interactive Hyper-V, Teach hooks,
visual capture, learning, ChatGPT Field operation, or Pilot execution.

## Open questions for a reviewer

1. Is the `1053`-plus-WMI-spawn mechanism acceptable as durable, or a workaround
   to replace now that v12 exists? It works and is instrumented, but it depends
   on SCM kill semantics and WMI parentage rather than on a supported contract.
2. Should the v10 base image's timezone be corrected permanently, so generations
   stop needing an in-guest clock fix at all? That is the better end state and
   conflicts with v10 being immutable.
3. Why does offline registry servicing fail on a clean image? Unexplained, and
   it blocks future image operations beyond this one.
4. Do the contract tests guard the right invariants? They were chosen by an
   agent, not an owner, and they now permit a clock write while forbidding any
   read of the authorization.

## Next milestone

Create a disposable Field generation from v12 and prove bootstrap, authenticated
channel, heartbeat, canonical identity, display contract, policy and attestation.
That work is now unblocked for the first time.
