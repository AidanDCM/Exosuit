# Exosuit Field — session handoff

**Written:** 2026-07-27 15:35 local
**Repository:** `C:\Users\Aidan\OneDrive\Desktop\AI Exosuit PR11`
**Branch:** `codex/issue-20-personal-disk-identity`
**HEAD:** `30fb6e1` — working tree clean
**Read this first, then `docs/engineering_log/2026-07-26-field-base-system-dispatch-findings.md` for the deep history.**

---

## 1. What this project is doing right now

Building sealed Windows base images, then creating disposable Hyper-V "Field"
generations from them, and proving the guest comes up with an authenticated
channel. Everything is driven from the primary desktop, which is the management
plane. The guest work happens inside isolated, network-detached VMs.

## 2. State of the world

### Promoted base images (all read-only, in `C:\ProgramData\Exosuit\Images`)

| Image | SHA-256 | Notes |
|---|---|---|
| v10 | `624a27cf5b0c8172…` | **Immutable build source. Never delete.** Every build clones it. |
| v12 | `6fdb1b2d969d8bb6…` | First successful seal |
| v13 | `5c9a21c0e226b33f…` | **Last known-good for guest bring-up** |
| v14 | `3a98f93032096b43…` | Current; guest **regressed**, see §4 |

v1–v9 were deleted this session (88 GB reclaimed). Disk now ~161 GiB free.

### What is proven working

- Base image build → seal → Sysprep → promote, unattended, **~6 minutes**
- Field generation provisioning from a base image, 9/9 steps
- Guest bring-up **on v13**: handshake + bootstrap + heartbeat all verified,
  10/12 bootstrap checks, `lifecycle: ready`
- L0 validator green on exact head, 15/15 steps

### What is not proven

Everything past guest readiness: scene, Teach, artifact transfer, Shadow,
personal models, Assisted, Pilot, ChatGPT, packaging, security, operations.

### Formal production readiness: **0 of 22 gates**

`node scripts/validate-production-readiness.mjs --report-only`. Four gates carry
evidence (`evidence_recorded`) but **none is marked `pass`** — deliberately, see §6.

---

## 3. The immediate task

**v14 regressed and I was about to diagnose it when the session ended.**

- v13 generation: reached ready in 33 polls
- v14 generation: **150 polls, no `Exosuit.Field.Handshake` at all** — the agent
  never started, rather than failing a check

### Leading hypothesis (mine, unverified)

v14 is the first image where the builder **injects the guest agent binary**
(`Build-FieldBaseImage.ps1`). It copies `Exosuit.Agent.exe`, `.dll`,
`.runtimeconfig.json`, `.deps.json` over whatever v10 shipped. If v10's agent had
a different deployment shape — more dependency assemblies, different runtime
version — the guest now has a new exe against stale dependencies, which would
fail at .NET startup before any KVP write.

### Exact next step

Run this and read the output (needs UAC approval):

```
artifacts\field-l4-v14-boot\generation-1\INSPECT V14 GUEST.cmd
```

It prints the guest's `Exosuit\Agent` directory listing, the on-disk agent
digest, and `guest-runtime-error.log`, which should contain the .NET startup
error verbatim. Takes ~15 seconds. It mounts the overlay with `Mount-DiskImage`
from the Storage provider and **never calls a Hyper-V cmdlet for the mount** —
that is deliberate, see §5.

### If the hypothesis is right

Either inject the complete publish output rather than four files, or revert the
binary injection and keep v13's approach. **v13 is intact and known-good**, so
falling back is cheap.

---

## 4. Live artifacts for the current attempt

- Field ID `b449d4f1-334f-495e-9e99-513220339d56`, generation 1, from v14
- Evidence: `artifacts/field-l4-v14-boot/generation-1/`
- Seed/secrets: `C:\Users\Aidan\.codex\secrets\exosuit\b449d4f1-…-g1\`
- The VM `Exosuit-Field-b449d4f1-…-G1` may still exist; the inspector stops it.

---

## 5. Hard-won knowledge. Do not rediscover these.

**Hyper-V wedges after the host sleeps.** `Get-VM` can spin at 100% CPU
indefinitely. Restarting `vmms` clears it. Any script touching Hyper-V must bound
its calls in a job with a timeout. Prefer `Mount-DiskImage` (Storage provider)
over `Mount-VHD` for read-only inspection.

**Guest scripts and the agent binary live in the base image.** A repository fix
does **not** reach a guest until a new base image is sealed. This silently cost
two Field generations. `Build-FieldBaseImage.ps1` now records
`injectedScriptDigests` and `agentBinarySha256` so the binding is evidence.

**.NET builds are not reproducible.** The same commit produces a different agent
digest each build. So the seed manifest must take the digest **from the build
result**, not recompute it from disk. Passing it as argv[8] to the generator does
this. Getting this wrong breaks the `agent_binary` check confusingly.

**`powershell -File` passes every argument as a string.** `[int[]]` typed
parameters silently mangle `"1,2,3"` into `123` (commas read as thousands
separators). Take a string and parse it.

**`2>&1` on native commands under `ErrorActionPreference='Stop'`** turns stderr
into a terminating error. Cost three separate failures. Use `cmd /c` wrappers or
set `Continue` around the call.

**Windows Setup reserialises `Unattend.xml`** — drops comments, rewrites quote
style, adds `wasPassProcessed`. Byte digests of it can never match; the contract
compares canonical XML.

**Vitest does not typecheck.** Always run `npm run typecheck` **and**
`npm run test:field` before committing. A green test suite has hidden a type
error at least once.

**The guest clock.** The VM RTC carries host *local* time and the image timezone
differed, so guest UTC ran 3 hours fast and pre-expired every authorization. Fixed
in the bootstrap by capturing local wall time → `tzutil /s` → restoring it.
**Order matters**; any other order reproduces the fault.

---

## 6. Rules of engagement the owner has set

- **Never mark a readiness gate `pass`.** Acceptance criteria are proposed in
  `docs/qa/FIELD_GATE_ACCEPTANCE_CRITERIA.md` but **not ratified**. `ownerApproved`
  and `productionDecision` are the owner's alone.
- **Never seed the guest clock from the authorization.** It would void expiry as
  replay protection. A test asserts the bootstrap never reads `expiresAt`.
- **Ask before destructive actions.** Deleting VMs, generations, base images, or
  restarting host services has each been confirmed explicitly.
- **Never launch a base builder without saying so first.**
- **Elevation:** the assistant's shell is NOT elevated. Everything touching
  Hyper-V needs a `.cmd` launcher that self-elevates via `Start-Process -Verb
  RunAs`; the owner approves the UAC prompt. UAC prompts are frequently
  cancelled — if cancelled, report and ask, do not silently retry.
- Report failures with actual output. Do not claim success without verification.

---

## 7. Standard workflows

**Full validation** (~8 min):
```
powershell -NoProfile -ExecutionPolicy Bypass -Command "$env:DOTNET_ROOT='C:\Users\Aidan\.dotnet'; $env:PATH='C:\Users\Aidan\.dotnet;'+$env:PATH; & 'C:\Users\Aidan\OneDrive\Desktop\AI Exosuit PR11\scripts\windows\Invoke-ExosuitFieldValidation.ps1' -RepositoryRoot 'C:\Users\Aidan\OneDrive\Desktop\AI Exosuit PR11'"
```
Note: the .NET SDK is at `C:\Users\Aidan\.dotnet`, **not** `C:\Program Files\dotnet`
(which is runtime-only). Without `DOTNET_ROOT` set, L0 dies during environment capture.

**Build a base image** — edit COMMIT in the .cmd, then run:
`artifacts\field-l4-base-build\BUILD FIELD BASE V<N>.cmd`
Requires clean tree and HEAD == pinned commit. ~6 min. Then reclaim staging:
`artifacts\field-l4-base-build\REMOVE V<N> STAGING.cmd`

**Create a Field generation:**
1. Register the image in `vm\field-host-config.local.json` (imageId, path, digest)
2. `node artifacts\field-l4-v6-boot\Create-V6Generation1.mjs <fieldId> 1 <imageId> <imageDigest> v<N> development <agentDigestFromBuildResult>`
3. Provision + monitor via the generation's `CREATE AND MONITOR V14 FIELD.cmd` pattern

**Field provisioning needs ≥80 GiB free disk** or the host capability check refuses.

---

## 8. Honest assessment

Engineering progress ~55–65%. Infrastructure (build, seal, promote, provision,
diagnose) is close to solid. The product — everything a user would actually
touch — is barely started. Formal production readiness is 0%, and correctly so:
all live evidence used development access, which is non-production by contract,
and each gate rests on a single run with no negative-case coverage.

Many failures this session were self-inflicted rather than Windows being hard.
The pattern that worked: **instrument before inferring.** Four root causes were
argued from absent output and all four were wrong; the boundary fell within one
attempt of writing a marker before anything could fail.
