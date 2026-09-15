# SCN-001 session-local structural producer boundary

- **Goal:** make raw guest UI Automation data safe and small enough to enter a future authenticated relay without allowing session-0 substitution or privacy leakage.
- **Master-plan phase / gate:** M2 / SCN-001; source/unit progress only, with no promotion.
- **Subsystem ownership:** Glove owns UIA observation/sanitization; Field supplies exact session/display/generation identity. No Field administration authority moves to the Glove.
- **Files changed:** `.NET FieldSceneProducerBoundary.cs` and tests; the TypeScript receiver byte/warning contract; Field architecture/status/test/threat/failure/traceability docs and Level 4 audits.
- **Identity/generation and policy impact:** requires exact Field/display/boot/agent/session inputs and a non-SYSTEM session-local caller. It is observe-only and cannot create/expand policy, consent, recording, input, export, or lifecycle authority.
- **Parts & Pieces / donor patterns:** reused compiled UIA observation contracts, Field identity/display contracts, structural sanitization rules, and existing KVP 16,000-character limit. No donor evidence is claimed.
- **Questions and assumptions:** the future relay must derive caller PID/SID/session and exact executable identity from Windows rather than trusting caller-supplied values. The 12 KiB payload budget leaves envelope headroom but still needs real KVP measurement.
- **Tests added:** structural serialization privacy, caller/session/provider/mode/freshness denial, screenshot denial, graph/cursor/modal validation, count and byte overflow without truncation.
- **Commands actually run:** repository/plan/Field/completion validators; TypeScript typecheck, focused scene tests, full Field suite, full repository suite, build, Field pulse, and system pulse; .NET SDK 8.0.423 restore, Release warnings-as-errors build, focused and full tests.
- **Results/evidence class:** source/unit only. Focused TypeScript passed 7/7. Field suite passed 51/51 files and 263/263 assertions; Field and system pulses passed 1/1 each. Full repository assertions passed 97/97 files and 694/694 assertions with no test failures, but Vitest returned nonzero after two `onTaskUpdate` worker RPC timeouts; this known harness failure is not reported as a clean aggregate process pass. Typecheck/build and all four validators passed. .NET build passed with 0 warnings/errors and 87/87 tests passed.
- **Unvalidated areas:** live session launch, OS-derived client identity, exact binary verification, relay authentication, KVP publication/acquisition, UIA accuracy, modal/cursor collection, lock/Secure Desktop, backpressure/restart, and privacy inspection.
- **Security/privacy impact:** removes raw UI and warning text before transport, denies screenshots and sensitive authority, and fails closed on identity/freshness/size inconsistency.
- **Failure behavior:** every denial occurs before serialization/publication. No external effect exists; emergency stop and uncertain-effect recovery are unchanged.
- **Storage impact:** no base, overlay, personal-state, or task disk changes.
- **Rollback:** leave boundary uncalled or remove the new source/test; receiver remains safe and unwired.
- **Next slice:** implement the OS-derived session-local launcher and authenticated one-way relay, then publish one bounded KVP scene record only after exact heartbeat/boot binding.
