# Exosuit GitHub Phase Final Audit

**Audit date:** 2026-07-17  
**Repository:** `AidanDCM/Exosuit`  
**Canonical branch:** `build/exosuit-mvp`  
**Product PR:** #1 (draft; not approved for merge or production use)  
**Audit method:** Parts & Pieces Atomic Audit, North Star interrogation, question-everything review, strict/fluid execution gates, source/evidence reconciliation, negative testing, and GitHub-hosted validation.

## Verdict

**GitHub phase verdict: PASS WITH LOCAL-VALIDATION HOLD.**

The repository now contains a coherent, buildable, test-backed Exosuit core. GitHub has validated the contracts, MCP protocol, fake full-chain execution, application memory, Windows-targeted compilation, local policy, approval binding, deadlines, audit behavior, and a transparent standard-Windows motor implementation.

This verdict does **not** mean the product is production-ready or that real desktop control has been proven. Real Windows UI Automation, real pointer/keyboard movement, focus changes, DPI/multi-monitor behavior, Secure MCP Tunnel connectivity, and ChatGPT-operated acceptance tests remain a Codex/local validation requirement.

## North Star

> A private, model-independent body that allows an authorized AI brain to inspect and operate a computer through narrow, auditable, locally governed capabilities while the user retains final authority.

The current architecture supports that North Star without coupling the body to one model vendor and without relying on stealth, anti-detection, anti-cheat, credential scraping, privilege escalation, arbitrary shell access, or covert surveillance.

## Implemented system surface

### ChatGPT/MCP pilot layer

- stdio MCP server suitable for OpenAI Secure MCP Tunnel,
- real MCP client/server protocol integration test,
- narrow tool discovery with read/write annotations,
- status, observation, element search, application-map memory, proposal, execution, emergency stop, and audit tools,
- explicit physical-input proposal tool,
- one authoritative proposal execution tool,
- gateway-to-agent request deadlines,
- loop and prompt-injection guards.

### Internal desktop sensing

- fake deterministic provider for CI,
- Windows UI Automation provider,
- active/open window discovery,
- accessible roles, names, states, automation IDs, supported actions, and geometry,
- sensitive-value omission,
- fresh re-observation before execution.

### Application memory

- versioned sanitized application maps,
- optional local persistence,
- atomic writes and bounded version retention,
- no live field values, raw runtime IDs, screenshots, plain window titles, or controls marked sensitive,
- fresh semantic rematching with confidence and warnings,
- no authorization or execution power in stored memory.

### Semantic execution

- focus window,
- invoke element,
- set value,
- select element,
- scroll into view,
- bounded wait,
- expected-result verification,
- stop-on-failed-verification behavior.

### Physical motor subsystem

- standard documented Windows APIs only (`SetCursorPos`, `SendInput`),
- bounded eased pointer trajectories,
- left click,
- Unicode text input,
- small explicit hotkey allowlist,
- simulated motor test seam,
- cancellation and deadline support,
- no hardware impersonation, stealth, anti-detection, or security bypass.

Physical input is impossible unless all of the following are present before process startup:

1. Windows provider selected,
2. Windows UI Automation risk acknowledgement,
3. physical-input flag enabled,
4. `EXOSUIT_INITIAL_MODE=full_control`,
5. exact full-control acknowledgement,
6. non-empty process allowlist.

Every physical action additionally requires:

- a fresh target window,
- that window to be active,
- an allowlisted process,
- in-window pointer coordinates where applicable,
- a fresh enabled, visible, focused target field for physical text,
- critical risk classification,
- exact local typed approval,
- immutable approval fingerprint verification,
- fresh policy reevaluation,
- bounded execution and verification,
- approval consumption.

### Local authority and audit

- loopback-only local agent,
- strong shared token requirement,
- local control panel and CSRF token,
- read-only/scoped/full-control mode separation,
- full control cannot be enabled through MCP or the panel,
- immutable approval fingerprints,
- local and gateway hash-chain ledgers,
- secret redaction,
- emergency stop that sets the stopped state before bounded provider cancellation,
- pending-proposal denial and approval clearing on stop.

## Evidence

### GitHub Actions functional validation

The motor-enabled system was validated on GitHub-hosted Linux and Windows runners.

Representative successful motor run:

- CI run `29619218878`
- commit `a3018407d176b7ab1dd2b2d94be23eb65a10671b`
- strict TypeScript typecheck: passed,
- TypeScript unit/integration suite: **34/34 passed**,
- production TypeScript build: passed,
- full-chain system pulse: passed,
- repository contract: passed,
- Windows build with warnings as errors: passed,
- .NET suite: **25/25 passed**,
- TRX and coverage artifacts captured.

Final focus-safety refinement:

- commit `e6d9fa32d7ece9ab9956d8ee3d6dd64a0d883b53`,
- added explicit denial for physical text targeting an unfocused element,
- added a dedicated negative .NET regression test,
- retained one authoritative MCP execution tool.

### Dependency/security validation

Representative supported private-repository security run:

- Security Audit run `29619196932`
- npm direct/transitive vulnerability audit: passed at high/critical gate,
- NuGet direct/transitive vulnerability audit: passed,
- no dependency changes were introduced by the final focus-safety refinement.

CodeQL SARIF upload is not available for this private personal repository without GitHub Code Security. Conditional CodeQL jobs remain configured for a future public or GHAS-enabled repository. The audit does not misrepresent unavailable CodeQL upload as a code failure or as completed evidence.

### Protocol validation

- MCP protocol run was exercised through linked SDK client/server transports,
- ChatGPT-facing tool discovery and annotations were verified,
- status/observe/map/propose/execute/verify/stop calls succeeded through MCP,
- a physical-input proposal was correctly blocked in sandbox mode,
- no direct orchestrator shortcut was used for that protocol test.

### Cross-language validation

- one canonical JSON wire fixture is parsed by TypeScript Zod contracts and .NET contracts,
- snake-case enums and the `equals` verification field remain compatible,
- Windows-targeted compilation is warnings-as-errors.

## Negative controls proven

- observation mode denies mutation,
- credentials and secret-bearing controls are blocked,
- destructive labels are blocked,
- changed active window blocks execution,
- missing or offscreen targets block execution,
- raw input is blocked outside locally acknowledged full control,
- nonallowlisted processes are blocked,
- pointer coordinates outside the target window are blocked,
- physical text without a fresh focused field is blocked,
- modified approved proposals fail fingerprint validation,
- expired/denied/blocked proposals cannot execute,
- provider and gateway hangs time out,
- caller cancellation remains distinct from timeout,
- repeated actions and step-budget exhaustion stop,
- visible prompt-injection patterns block mutation,
- audit tampering is detected,
- action after emergency stop is blocked,
- application maps exclude sensitive/live data and never authorize actions.

## Open risks requiring Codex/local evidence

1. Real Windows UI Automation runtime IDs may differ across applications, restarts, and virtualized controls.
2. `SetCursorPos` and `SendInput` must be observed in an interactive desktop session.
3. Foreground-window changes during motor movement require live interruption testing.
4. DPI scaling, multiple monitors, negative virtual-screen coordinates, remote sessions, elevated windows, UAC, lock/unlock, and minimized windows need testing.
5. Physical text must be tested against actual focused fields and IME/non-US keyboard scenarios.
6. Emergency-stop latency must be measured during live movement and typing.
7. The local HTML approval panel needs human-factors review.
8. Secure MCP Tunnel and ChatGPT developer-mode discovery must be validated with the current OpenAI client and account.
9. Application-map files need manual privacy inspection against real applications whose accessible names may contain business context.
10. Screenshots remain disabled and unimplemented in the Windows provider; any future visual-fallback slice requires a separate privacy-critical audit.
11. Browser DOM/native-extension access beyond the operating-system accessibility tree remains a separate future adapter.

## Explicit exclusions

The repository must not be extended to include:

- anti-bot or anti-cheat evasion,
- hidden or undetectable automation claims,
- kernel input drivers for concealment,
- hardware-input impersonation,
- credential harvesting,
- privilege escalation,
- arbitrary remote shell execution,
- covert recording or surveillance,
- bypassing application or platform safety controls.

## Codex promotion gate

The next phase may begin in Codex on a dedicated Windows user or VM. Do not use real accounts, production files, financial applications, private messages, or irreversible targets during initial validation.

Promotion from **GitHub validated** to **Windows validated** requires the entire matrix in `docs/TEST_PLAN.md` and `docs/CODEX_HANDOFF.md`, including:

- local startup/authentication,
- observe-only UI Automation,
- application-map privacy and rematching,
- one disposable Notepad semantic action,
- motor simulation and live pointer/typing tests,
- wrong-window/focus/process/coordinate denials,
- approval fingerprint behavior,
- gateway/provider deadlines,
- emergency-stop latency,
- audit verification,
- Secure MCP Tunnel,
- normal ChatGPT conversation acceptance.

## Final GitHub-phase decision

- **Merge to main:** HOLD until Codex/local validation evidence is attached.
- **Production use:** DENIED.
- **Use with real accounts or consequential targets:** DENIED.
- **Proceed to isolated Codex/local validation:** APPROVED.
