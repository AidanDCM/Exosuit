# Engineering Log — Make the Coordinator Surface Opt-In

**Date:** 2026-07-27
**Branch:** `build/exosuit-mvp`
**Starting commit:** `c3c1b1e` (docs: run the .NET gate, re-validate fake chain, reconcile roadmap status)
**Evidence class:** local TypeScript and .NET validation, plus runtime verification against built output; no Windows-provider, ChatGPT, or hosted-CI evidence

## Goal

Let Phase 1 acceptance expose the reviewed desktop core alone.

`composeServer` in `src/server.ts` called `registerCoordinatorMcpTools` unconditionally, so every connected pilot discovered all twenty-seven tools with no way to narrow them. `docs/CODEX_HANDOFF.md` Phase 9 requires the discovered list to match the reviewed core surface, Phase 10 requires that only reviewed tools are discovered, and the stop conditions treat an unexpected discovered tool as a halt. Those gates could not be satisfied as the code stood.

## Design

`EXOSUIT_MCP_SURFACE`, resolved by the exported `resolveMcpSurface`:

| Value | Composition |
|---|---|
| unset, empty, or `core` | `src/mcp.ts` plus `src/motorMcp.ts`, 13 tools |
| `full` | the above plus `src/coordinatorMcp.ts`, 27 tools |
| anything else | throws at startup |

Matching is trimmed and case-insensitive, consistent with the existing `EXOSUIT_PROVIDER` handling in the .NET host. Both `createExosuitMcpServer` and `createExosuitMcpServerWithState` accept an `environment` parameter defaulting to `process.env`, following the pattern already established by `createWorkflowRuntimeFromEnvironment`.

The startup report gained `mcpSurface`, and `src/index.ts` prints it, so an operator can confirm the surface before connecting ChatGPT rather than inferring it from a tool count.

### Why the default is `core`

The safe state must be the one reached by omission. An operator who forgets the variable gets the reviewed, narrower surface, and widening requires a deliberate act. Defaulting to `full` would have preserved exactly the exposure this change exists to fix.

The coordinator is `in_progress` with no hosted CI and no interactive evidence. The repository's safety-asymmetry rule states that removing or demoting capability is usually safe while expanding autonomy is not, so an unvalidated surface must be opted into.

This is a behavior change for anyone composing a server and expecting coordinator tools. That is acceptable: the coordinator has never passed acceptance or been connected through a tunnel, so nothing depends on it in a validated configuration. `tests/mcpProtocol.test.ts` opts into `full` explicitly because it asserts the complete surface.

### What this is not

Surface selection controls **exposure only**. It is not a security boundary for coordinator behavior:

- workflow and agent state still hydrate under `core`,
- every coordinator policy, approval, and verification requirement is unchanged in both modes,
- hiding a tool is never a substitute for its safety controls.

This is stated in `docs/ARCHITECTURE.md` and the decision log so the flag is not later mistaken for a containment mechanism.

## Files changed

- `src/server.ts` — `McpSurfaceMode`, `DEFAULT_MCP_SURFACE`, `resolveMcpSurface`, conditional composition, `mcpSurface` in the startup report.
- `src/index.ts` — startup line reports the composed surface.
- `tests/documentedToolSurface.test.ts` — restructured for two surfaces; added flag tests.
- `tests/serverStartup.test.ts` — startup-report shape; added full-mode and invalid-value cases.
- `tests/mcpProtocol.test.ts` — opts into `full` with a comment explaining why.
- `README.md`, `docs/SECURE_MCP_TUNNEL_RUNBOOK.md`, `docs/CODEX_HANDOFF.md`, `docs/ARCHITECTURE.md`, `docs/MASTER_SYSTEM_ROADMAP.md`, `docs/logs/DECISION_LOG.md`.
- `docs/engineering_log/2026-07-27-mcp-surface-composition-flag.md`.

No `apps/` file changed.

## Parts & Pieces and donor patterns considered

- Reused the environment-parameter pattern from `createWorkflowRuntimeFromEnvironment` rather than reading `process.env` inline, which is what made the flag directly testable without mutating global state.
- Reused the fail-closed convention already used for `EXOSUIT_PROVIDER` and the workflow persistence variables: an unrecognized value throws instead of silently choosing a mode.
- Rejected a boolean such as `EXOSUIT_ENABLE_COORDINATOR`. A named surface extends to future groups without accumulating booleans whose combinations are unclear.
- Rejected an acknowledgement-string gate like `EXOSUIT_FULL_CONTROL_ACK`. Those exist for physical-desktop risk; the coordinator is unvalidated, not dangerous in that sense, and overloading the pattern would dilute it.
- Rejected defaulting to `full` for backward compatibility, for the reasons above.
- No donor code was copied, ported, or adapted.

## Tests added or updated

Seven new tests, 135 to 142 total:

- default resolves to `core` for unset, `undefined`, and whitespace values;
- `core` and `full` accepted trimmed and case-insensitively;
- six unrecognized values each throw, including the near-miss `cor` and the plausible `all`, `coordinator`, `true`, `1`, and `core,full`;
- no coordinator tool is reachable on `core`, asserted per tool across all fourteen names rather than by count;
- all fourteen appear under `full`;
- `full` is a strict superset of `core`, so enabling the coordinator can add tools but never remove or rename one;
- the startup report names the composed surface, and an invalid value fails startup.

The documented-surface test now checks the runbook against `core` and the README against `full`, matching what each document governs.

## Commands actually run

```text
npm run typecheck
npm test
npm run build
npm run test:pulse
npm run validate:typescript
"$USERPROFILE/.dotnet/dotnet.exe" test apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --configuration Release
node <scratch script against dist/>          # default composition from built output
EXOSUIT_MCP_SURFACE=everything node -e ...   # invalid-value behavior from built output
```

## Results

- TypeScript typecheck: passed.
- TypeScript tests: **142 passed, 30 files**, up from 135.
- Build and system pulse: passed.
- Repository validator: passed, 34 artifacts.
- .NET build and tests: passed, **29/29**.
- Runtime verification against `dist/` with no environment variable set: `startup.mcpSurface` reported `core`, exactly 13 tools were discovered, and zero coordinator tools were present.
- `EXOSUIT_MCP_SURFACE=everything` threw `EXOSUIT_MCP_SURFACE must be "core" or "full".` from the built output.

The runtime check matters more than the unit tests here: it exercises the real default path an operator hits, through the compiled artifact that `npm run start:mcp` executes.

## Assumptions and unvalidated areas

- Verified through the in-memory transport and the built output, not through a real Secure MCP Tunnel. What ChatGPT actually discovers remains unverified until Phase 10, which is still blocked on the disposable environment.
- Coordinator tool **behavior** was not retested. The existing suites cover it, and this change alters registration only.
- Hydration still runs under `core`, so a `core` server with `EXOSUIT_WORKFLOW_STATE_DIR` set loads checkpoints it will not serve. Harmless and left deliberate: hydration and exposure are separate concerns, and coupling them would make the flag a data-lifecycle switch as well.
- The thirteen and twenty-seven counts are asserted in tests, so a future tool addition fails loudly rather than silently widening what Phase 1 sees.

## Security impact

Net reduction in exposure, and the first change in this session that alters runtime behavior rather than documentation.

Before, any pilot connecting through any transport discovered fourteen coordinator tools that carry no hosted CI evidence and no interactive validation. Now the default composition omits them, and reaching them requires a deliberate environment variable.

No capability was added. No policy, approval, verification, audit, deadline, or emergency-stop behavior changed. The coordinator's own controls are untouched, and the exposure-only limit is documented so the flag is not mistaken for containment.

An unrecognized value fails startup, so a typo produces a refusal rather than a silently widened surface.

## Rollback or disable path

Set `EXOSUIT_MCP_SURFACE=full` to restore the previous surface with no code change. To remove the mechanism entirely, revert this commit; `composeServer` returns to registering the coordinator unconditionally. Requires a gateway restart either way. No persisted state, contract, or on-disk format changed, so rollback is safe in both directions.

## Next recommended slice

The scoping decision this implements was the last item reachable without owner action. What remains is gated on you:

1. **Billing.** Resolve the GitHub billing state and dispatch `runner-smoke.yml`. No phase can reach `github_validated` until hosted CI runs.
2. **Phase 1 environment.** Provision the disposable Windows VM or dedicated account, then execute `docs/CODEX_HANDOFF.md` in order. The .NET blocker is gone and the surface is now correctly scoped, so the environment is the only remaining dependency.
3. **Ordering.** Phases 2 through 10 were built ahead of Phase 1 acceptance. Whether to continue in that order or stop and validate is an owner call about how much unvalidated capability to accumulate.
