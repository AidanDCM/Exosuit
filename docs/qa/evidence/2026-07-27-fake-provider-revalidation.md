# Fake-Provider Chain Re-validation — 2026-07-27

**Scope:** `docs/CODEX_HANDOFF.md` Phase 2, fake-provider host, re-run on the current head.
**Head at time of run:** `6c1f7ef` plus uncommitted documentation work.
**Environment:** developer workstation, not a disposable VM.
**Provider:** fake. **Windows provider not used. Physical input not armed. Screenshots disabled.**

## Why this run exists

`docs/qa/CODEX_WINDOWS_ACCEPTANCE.md` records Phase 1 evidence pinned to a 2026-07-18 commit. The branch has since gained roughly 74 commits, including the coordinator, supervisor, virtual-desktop, browser, skill, performance, and support-bundle work, plus three fixes on 2026-07-27.

This run does **not** extend Phase 1 coverage. It re-checks that the original single-agent fake-provider chain still behaves correctly after that expansion. It is a regression check, not new acceptance evidence.

## Environment isolation

- Agent token generated locally as 24 random bytes, hex encoded, written outside the repository. The value was never printed, logged, or committed.
- `EXOSUIT_DATA_DIR` pointed at a scratch directory outside the repository, so no audit ledger was written to the working tree.
- `EXOSUIT_PROVIDER=fake`, `EXOSUIT_ENABLE_PHYSICAL_INPUT=false`, `EXOSUIT_ENABLE_SCREENSHOTS=false`.
- The agent process was terminated at the end of the run and the port confirmed released.

## Results

| # | Check | Expected | Observed | Result |
|---|---|---|---|---|
| 1 | Bind address | loopback only | `TCP 127.0.0.1:43117 LISTENING`; no `0.0.0.0` binding | pass |
| 2 | `/v1` without token | 401 | HTTP 401 | pass |
| 3 | `/v1` with wrong token | 401 | HTTP 401 | pass |
| 4 | Status with valid token | sandbox, no physical input, no screenshots | `provider=fake-sandbox`, `mode=sandbox`, `physicalInputEnabled=false`, `screenshotCaptureEnabled=false`, `emergencyStopped=false` | pass |
| 5 | Control panel | loads | HTTP 200, `text/html` | pass |
| 6 | Observation | fake desktop visible | active window `Exosuit Test Notepad` / `exosuit-fake-notepad`; 2 windows, 3 elements (`el-editor`, `el-save`, `el-seven`) | pass |
| 7 | Semantic proposal | allowed in sandbox | `allow` / `sandbox-semantic-action` | pass |
| 8 | Execute and verify | succeeded, verification passed | `succeeded`, `passed`, actual equals expected | pass |
| 9 | Physical input in sandbox | blocked | `blocked`, `raw-input-local-only`, risk `critical` | pass |
| 10 | Audit chain before stop | valid | `{"valid":true,"checked":5}` | pass |
| 11 | Emergency stop | stops, no provider timeout | `stopped=true`, `providerCancellationTimedOut=false` | pass |
| 12 | Mutation after stop | blocked | `blocked`, `emergency-stop-lock` | pass |
| 13 | Audit chain after stop | valid | `{"valid":true,"checked":7}` | pass |
| 14 | Token leakage | absent everywhere | absent from audit API, agent log, and persisted `audit.jsonl` | pass |

### Audit events recorded

```text
0  agent_started     local-agent
1  desktop_observed  mcp
2  action_proposed   test
3  action_executed   local-agent
4  action_proposed   test
5  emergency_stop    mcp
6  action_proposed   test
```

The persisted ledger contains 7 lines, begins at sequence 0 with `previousHash` `GENESIS`, and chains to sequence 6.

## Timing note, not a latency measurement

The emergency-stop HTTP round trip measured **153 ms** from an external `curl`. That figure includes process start of `curl`, TCP connect, HTTP, and JSON handling, and it is **not** internal emergency-stop latency.

`docs/qa/CODEX_WINDOWS_ACCEPTANCE.md` records an internal figure of 8.06 ms from audit timestamps, which is the correct kind of measurement. The 153 ms number here must not be quoted as a latency regression or improvement.

## What this run does not prove

- No real Windows UI Automation was exercised.
- No physical input was armed, moved, clicked, or typed.
- No screenshot capability was enabled or tested.
- No Secure MCP Tunnel or ChatGPT connection was involved.
- No coordinator, supervisor, virtual-desktop, browser, or skill surface was exercised; those have unit coverage only.
- This was not run in a disposable VM, so it carries no weight toward the Phase 1 environment requirement.

## Cross-language gate, same session

| Gate | Result |
|---|---|
| TypeScript typecheck | passed |
| TypeScript tests | 135 passed, 30 files |
| TypeScript build | passed |
| System pulse | passed |
| Repository validator | passed, 34 required artifacts |
| .NET restore | passed |
| .NET build, Release, `-warnaserror` | passed, 0 warnings, 0 errors |
| .NET tests | **29 passed, 0 failed** |

The .NET gate had not been run in either of the two preceding sessions because `dotnet --list-sdks` reported no SDKs. The SDK was installed at `%USERPROFILE%\.dotnet` and shadowed on `PATH` by a hostfxr-only install. See `README.md`.
