# Engineering Log — Reconcile the Documented MCP Tool Surface

**Date:** 2026-07-27
**Branch:** `build/exosuit-mvp`
**Rebased onto:** `5302cf0` (ci: add minimal hosted runner allocation smoke test)
**Evidence class:** local TypeScript validation plus static reconciliation; no Windows, ChatGPT, or .NET evidence

## Goal

Make the published MCP tool surface match the surface `src/server.ts` actually registers, and add a test that keeps them matched.

`docs/CODEX_HANDOFF.md` Phase 9 requires the discovered MCP tool list to match the reviewed surface, Phase 10 requires that only reviewed tools are discovered, and the stop conditions treat an unexpected discovered tool as a halt. Those gates are only as good as the allowlist they compare against.

## How this slice changed mid-flight

This work began against local commit `d48cbc7` and was written for a thirteen-tool surface. A `git fetch` before pushing revealed the branch was 74 commits behind origin. The upstream branch had added the coordinator, supervisor, virtual-desktop, browser-companion, skill, performance, and support-bundle work between 2026-07-19 and 2026-07-21, growing `src/` from 11 files to 30.

The original conclusion was therefore wrong in its numbers and had to be redone against the real tree. The corrected finding is worse than the original:

- `src/server.ts` registers **twenty-seven** tools: thirteen desktop core plus fourteen coordinator.
- `registerCoordinatorMcpTools` is called unconditionally inside `composeServer`. There is no environment flag that hides the coordinator surface.
- `docs/SECURE_MCP_TUNNEL_RUNBOOK.md` published a thirteen-name allowlist, so a Phase 10 run would have discovered fourteen undocumented tools.
- `README.md` omitted `desktop_execute_physical_proposal` from its desktop-core list, which was the original defect and survived the upstream expansion untouched.

## Files changed

- `README.md` — added the missing `desktop_execute_physical_proposal` bullet; corrected a total-count sentence that the rebase would otherwise have left asserting "thirteen tools" directly above fourteen more.
- `docs/SECURE_MCP_TUNNEL_RUNBOOK.md` — allowlist rewritten to all twenty-seven names in two labeled groups, with an explicit note that the coordinator surface cannot be hidden by scoping a document.
- `docs/qa/GITHUB_PHASE_FINAL_AUDIT.md` — corrected "one authoritative execution tool" to "path", and marked the document historical so its counts are not read as current.
- `docs/logs/DECISION_LOG.md` — restated the 2026-07-17 execution decision as one path rather than one tool name, recorded the coordinator-allowlist finding, and left an open question for the owner.
- `tests/documentedToolSurface.test.ts` (new).
- `docs/engineering_log/2026-07-27-reconcile-mcp-tool-surface.md`.

`docs/ARCHITECTURE.md` was **not** changed. The earlier version of this slice edited it; upstream had since restructured that file around the coordinator and no longer publishes a tool list there. The stale edit was dropped during rebase rather than forced in.

## Parts & Pieces and donor patterns considered

- Applied the evidence-source guard: the registered surface, discovered over a real MCP client, is the authority. Documents were corrected to match it, never the reverse.
- Applied the question-everything doctrine by separating the true invariant (one execution path) from the inaccurate claim (one execution tool), rather than deleting a tool to make an old sentence true. Removing `desktop_execute_physical_proposal` would have been a capability change disguised as a documentation fix.
- Applied the roadmap Evidence invariant that escaped defects become regression tests.
- Rejected resolving the rebase conflict by keeping the local version. The local version was written against a superseded tree and was simply wrong.
- No donor code was copied, ported, or adapted. The test reuses the `InMemoryTransport` linked-pair pattern already established in `tests/mcpProtocol.test.ts`.

## Tests added or updated

Added `tests/documentedToolSurface.test.ts` with four tests:

- two parameterized cases asserting that the tool list published under a named heading in `README.md` and `docs/SECURE_MCP_TUNNEL_RUNBOOK.md` equals the tools actually registered by `src/server.ts`, discovered over a real MCP client;
- one test asserting that exactly `desktop_execute_proposal` and `desktop_execute_physical_proposal` are the execution tools, so a third execution tool name fails deliberately;
- one test asserting the coordinator surface is present, documenting that it is registered unconditionally and that the tunnel allowlist must therefore cover it.

The test rejects an empty section and duplicate entries, so deleting a list rather than maintaining it does not produce a vacuous pass.

Negatively verified twice. Against the stale tree, deleting the `desktop_execute_physical_proposal` bullet from `README.md` produced `expected [ …(12) ] to deeply equal [ …(13) ]`. Against the real tree, before the runbook was fixed, it produced `docs/SECURE_MCP_TUNNEL_RUNBOOK.md is out of sync with src/server.ts.: expected [ …(13) ] to deeply equal [ …(27) ]` — that is, the test found the live defect on its own rather than merely confirming a fix.

No .NET test changed. This slice touches no C# file.

## Commands actually run

```text
git fetch origin
git rebase origin/build/exosuit-mvp
npm install --ignore-scripts
npm run typecheck
npm test
npm run build
npx vitest run tests/documentedToolSurface.test.ts
git diff --check
```

## Results

Recorded in the "Results after rebase" section below, which was written after the full suite was re-run on the rebased tree.

## Assumptions and unvalidated areas

- The registered surface was enumerated with the default `createExosuitMcpServer` composition and the fake agent. A different `EXOSUIT_*` persistence configuration changes hydration behavior but is not expected to change which tools are registered, because `composeServer` registers unconditionally. This was not tested across configurations.
- The correction note in `docs/qa/GITHUB_PHASE_FINAL_AUDIT.md` assumes its cited CI runs were produced against the thirteen-tool surface of that commit. Historical run logs were not re-fetched.
- The test parses Markdown by heading and bullet shape. Restructuring either document's surface section fails the test with a "no longer contains the heading" error, which is intended to force a deliberate update rather than a silent skip.
- **Not addressed by this slice:** the upstream roadmap still records Phase 0 as `in_progress`, Phase 1 as `planned`, and Phase 2 as `planned`, while the branch contains implementations of Phase 2 and later. That contradiction is real and is left for the owner, because resolving it means deciding what evidence those phases actually have, which is not a documentation question.

## Security impact

No runtime capability, permission, network binding, provider, action, approval requirement, audit behavior, or feature gate changed. No file under `src/` or `apps/` was modified.

The change reduces risk. Local acceptance now has an accurate allowlist, so a genuinely unexpected tool during Phase 10 will stand out instead of being lost among fourteen known-undocumented ones. The regression test prevents a future tool registration from reaching ChatGPT undocumented.

It also removes an inaccurate safety claim. "One authoritative execution tool" overstated the surface; "one authoritative execution path" is what the code guarantees and what a reviewer can verify.

The slice surfaces but does not resolve a real exposure: the coordinator surface reaches any connected pilot with no flag to prevent it.

## Rollback or disable path

Revert this commit. Documentation returns to the previous lists and the test is removed. No runtime rollback and no restart are required, because no executable component changed.

## Next recommended slice

1. Owner decision: should Phase 1 acceptance present the desktop core alone? If yes, add an explicit composition flag to `src/server.ts` and a test that the coordinator surface is absent when it is off. This cannot be done in a document.
2. Reconcile the roadmap phase statuses with what the branch actually implements, and record what evidence Phases 2 and later hold. The roadmap's own change-control rule requires a decision-log entry for changes touching remote agents, persistence, or physical input.
3. Only then return to Phase 1 environment work: install the .NET 8 SDK and provision the disposable VM or dedicated account required by `docs/CODEX_HANDOFF.md`.

> **Correction, 2026-07-27.** Item 3 was based on a wrong premise. The .NET 8 SDK was already installed at `%USERPROFILE%\.dotnet` (8.0.423) and only shadowed on `PATH`. No installation is required; the remaining Phase 1 dependency is the disposable environment alone. See `docs/engineering_log/2026-07-27-run-dotnet-gate-and-phase2-revalidation.md`.
