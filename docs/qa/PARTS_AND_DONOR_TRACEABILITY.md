# Parts & Pieces and Donor Traceability

**Date:** 2026-07-17  
**Purpose:** Make reuse, adaptation, rejection, tests, and remaining evidence explicit for Exosuit.

## Status vocabulary

- **Implemented/tested donor** — donor behavior has code and donor tests; Exosuit still needs its own tests.
- **Blueprint donor** — architecture or README specification only; no donor implementation evidence is assumed.
- **Doctrine/manual** — process, audit, safety, or documentation guidance.
- **Reference product** — useful working system whose product responsibility remains separate.
- **Rejected shortcut** — considered and deliberately excluded.

## Parts & Pieces doctrine and governance

| Source | Type | Exosuit application | Enforcement/evidence |
|---|---|---|---|
| `DEVELOPER_OPERATING_SYSTEM.md` | Doctrine/manual | small slices, evidence discipline, reusable factory mindset | `AGENTS.md`, Exosuit developer OS, PR checklist |
| `docs/dev_manual/ATOMIC_AUDIT.md` | Doctrine/manual | Level 4 audit for execution-sensitive boundaries | `docs/qa/ATOMIC_AUDIT_BASELINE.md` |
| `docs/dev_manual/QUESTION_EVERYTHING_PROTOCOL.md` | Doctrine/manual | explicit assumption, question, failure, and missing-piece review | audit ledgers and change checklist |
| `docs/dev_manual/NORTH_STAR_INTERROGATION.md` | Doctrine/manual | precise model-independent local-body North Star | developer OS and architecture |
| `docs/dev_manual/STRICT_PRECISION_FLUID_EXECUTION.md` | Doctrine/manual | strict safety/evidence; adaptable implementation order | PR checklist and audit |
| `docs/dev_manual/DEV_LOOP_SENTINEL.md` | Doctrine + tested reusable part | repeated/no-progress work must halt and become an explicit question | runtime loop guard now; development-loop reporting required in engineering logs |
| `docs/QUALITY_GATES.md` and repo workflow | Doctrine/workflow | docs, tests, audit, secret-shape, build and review gates | `.github/workflows/ci.yml`, CodeQL, PR checklist |
| `pp_brain/BRAIN_API_AND_UNIVERSAL_TOOL_GATEWAY.md` | Blueprint/doctrine | brain/tool separation and stable tool boundary | MCP gateway and provider-neutral contracts |

## Reusable implementation and blueprint parts

| Part | Donor maturity | Exosuit decision | Exosuit proof |
|---|---|---|---|
| `command-broker` | Implemented/tested donor | principles adapted; no shell execution exposed | dual policy tests and deny-by-default rules |
| `event_ledger` / JSONL telemetry | Implemented/tested donor | adapted and strengthened with predecessor hashes and redaction | TS and .NET tamper/redaction tests |
| `reconciliation` | Implemented/tested donor | expected-vs-actual verification model adapted | fake-provider verification and system pulse |
| `loop_detector` | Implemented/tested donor | TypeScript runtime repetition/step guard adapted | repeat and budget tests |
| `dev_loop_sentinel` | Implemented/tested donor | doctrine/process adopted; not imported into runtime | PR/engineering-log loop budget requirement |
| `redaction_scan` | Implemented/tested donor | secret and sensitive-output redaction concepts adapted | ledger redaction tests and CI scan |
| `jsonl_validator` | Implemented/tested donor | schema validation intent handled by Zod/.NET JSON contracts | contract tests; cross-language fixtures remain required |
| `check_runner` | Implemented/tested donor | PASS/REVIEW/FAIL release posture adopted conceptually | audit verdict and CI result reporting; reusable runner deferred |
| `evidence_source_guard` | Implemented/tested donor | stale/partial evidence rule adopted | evidence-level separation in test plan/audit |
| `path_scope` | Implemented/tested donor | deferred until model-supplied file tools exist | hard prerequisite documented |
| `desktop_control_harness` | Blueprint donor | architecture adapted and independently implemented | provider interface, fake-first flow, stop and verification tests |
| `approval_gate` | Blueprint donor | independently implemented locally | proposal state, local approval, expiry, policy tests; live UX pending |
| `audit_timeline` | Blueprint donor | implemented as local/gateway ledgers, not copied | hash-chain tests; full deletion remains residual risk |
| `mcp_gateway` / `tool_gateway` | Blueprint donor | independently implemented with narrow MCP tools | typecheck/build/system pulse pending CI |
| `background_job_manager` | Blueprint donor | deferred; no background autonomy in MVP | explicit exclusion |

## Other repositories

| Repository | Role | Reused/adapted | Not copied or claimed |
|---|---|---|---|
| `AI-Desktop-Operating-System-` | Reference product/cockpit | permission states, review-first workflow, event timeline, job state concepts, emergency-stop posture, desktop-control research | host UI and 199-test suite remain separate; no claim those tests validate Exosuit |
| `mcp-platform` | MCP reference | SDK/service organization and structured tool approach | no wholesale repository merge |
| `Dev-Orchestrator` | Reference orchestrator | North Star, slices, permission/event-ledger and handoff discipline | no autonomous development loop inside Exosuit runtime |
| `Pokemon-yellow-bot` | Runtime adapter reference | thin provider boundary separating planner from live environment | emulator/game-specific behavior excluded |
| `Futures-Trading` through Parts & Pieces | Safety/evidence donor | system pulse, consistency and evidence discipline | trading behavior and risk logic excluded |
| `github-operator-mcp`, `codex-orchestrator-mcp`, `hosting-operator-mcp` | Structured hands | reinforce use of APIs/tools before desktop fallback | desktop control does not replace safer structured operators |
| `ai_code_assistant` | Audited anti-pattern donor | unauthenticated broad pyautogui/Selenium endpoint treated as a warning | no code reused; secrets and broad command endpoint explicitly rejected |

## Rejected shortcuts

- One unrestricted `control_computer` tool.
- Direct remote approval or model-declared approval.
- Browser or desktop automation designed to evade detection.
- Arbitrary shell execution inside the desktop provider.
- Coordinates as the primary language.
- Screenshot retention by default.
- Raw input in the GitHub-only MVP.
- Treating a donor blueprint or donor test count as Exosuit evidence.
- Treating GitHub-hosted compilation as proof of interactive Windows behavior.

## Required follow-through

Before GitHub phase completion:

1. TypeScript typecheck, tests, build, and system pulse are green.
2. .NET Windows-targeted build and pure tests are green.
3. Repository contract and CodeQL are green or any platform limitation is documented with evidence.
4. Cross-language contract fixtures validate important wire objects in both directions.
5. CI artifacts preserve diagnostics and test evidence.
6. The Level 4 audit records actual run IDs, failures, fixes, and remaining local checks.

Before live capability promotion:

1. Follow `docs/CODEX_HANDOFF.md` in a disposable Windows environment.
2. Prove local approval, wrong-window denial, verification, audit integrity, and emergency stop.
3. Connect the private ChatGPT MCP app using current official documentation.
4. Do not add raw input or screenshots in the same validation slice.
