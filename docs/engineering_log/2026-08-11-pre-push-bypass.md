# Pre-push gate bypassed to publish the SCN-001 branch

**Date:** 2026-08-11
**Branch:** `codex/scn001-authenticated-scene-channel`
**Authorized by:** repository owner, explicitly, after being shown the evidence below.

## What was bypassed

`git push` was run with `--no-verify`, skipping the pre-push CI-parity hook.

The hook ran against a clean checkout of HEAD and reported **11 of 12 checks passed**. The single
failure:

```
FAIL  typescript: unit and integration tests
      Error: [vitest-worker]: Timeout calling "onTaskUpdate"
```

Checks that passed: locked dependency install, typecheck, production build, full-chain system
pulse, windows-agent restore, windows-agent Release build with `-warnaserror`, windows-agent
tests, NuGet vulnerable-package audit (direct and transitive), locked npm install, and the npm
advisory audit for high/critical.

## Why this is a runner failure and not a code failure

Running the exact command CI parity uses, `npm test` (`vitest run`):

```
Test Files  105 passed (105)
     Tests  779 passed (779)
EXIT=1
```

Every assertion passed. The nonzero exit comes entirely from two Vitest worker
`onTaskUpdate` RPC timeouts.

## Two things checked rather than assumed

**Is the new PowerShell contract test the cause?** It spawns `powershell.exe` repeatedly, and
`tests/windowsFieldScripts.test.ts` already notes that a saturated full-suite worker can fail to
allocate `powershell.exe`. So it was the first suspect. Excluding it: 104 files, 772 tests, still
exit 1, still two RPC timeouts. **Not the cause.**

**Does this predate the branch?** Yes. The same failure is recorded in five prior engineering
logs, the earliest dated 2026-08-08 — before any commit on this branch:

- `2026-08-08-chn001-acceptance-contract.md`
- `2026-08-10-phase-correct-stop-gates.md` — "recorded as a runner failure, not a clean suite
  pass and not an assertion failure"
- `2026-08-10-scn001-relay-signing-boundary.md`
- `2026-08-10-scn001-scene-producer-boundary.md`
- `2026-08-10-scn001-windows-client-resolver.md`

## What was deliberately not done

The Vitest configuration was **not** changed to make the gate pass. The plausible fix is capping
worker threads, which slows CI for every run and could mask genuine failures. Editing shared test
configuration to get one push through would be changing the measuring instrument to suit the
result, and the fix deserves review on its own merits rather than as a side effect of publishing
a branch.

## Consequences and what remains owed

- Hosted CI will run these same jobs and may fail on the same runner defect. That failure will
  mean what it means here: assertion-clean, runner-nonzero.
- The underlying defect is still open. The known workaround is splitting the run —
  `--exclude tests/security/keyProtection.adversarial.test.ts --maxWorkers=2`, then that file
  alone — with both halves exiting clean. Making that the actual `npm test` would turn the gate
  green honestly and is the recommended next step, as its own reviewed change.
- No gate status changed as a result of this push. CHN-001 remains `passed`, SCN-001 remains
  `source_validated`, promotion remains denied.

## Verification captured at bypass time

- `npm test`: 105 files / 779 tests passed, exit 1 on two RPC timeouts.
- Without the new PowerShell test: 104 files / 772 tests passed, exit 1, same timeouts.
- .NET Release build with `-warnaserror`: 0 warnings, 0 errors; agent suite 230/230.
- `npm run validate:repository`: 88 required artifacts.
- `npm run validate:field-contract`: 88 artifacts / 28 modules.
- `npm run validate:completion`: unchanged — CHN-001 `passed`, SCN-001 `source_validated`, next
  phase M2, promotion denied.
- Working tree clean; push was a fast-forward from `origin` at `9c024ca`.
