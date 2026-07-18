# Decision Log

## 2026-07-17 — Separate Exosuit body from the cockpit

**Decision:** Build Exosuit as a focused model-independent body/MCP bridge. Keep `AI-Desktop-Operating-System-` as a compatible cockpit and donor.

**Reason:** The body needs independent security review, deployment, testing, and use by normal ChatGPT without requiring the complete IDE/control room.

## 2026-07-17 — Tool-only private ChatGPT app first

**Decision:** Ship narrow MCP tools before any widget UI.

**Reason:** The user wants the normal ChatGPT conversation to be the brain. The first UI that matters is local approval and stopping, which belongs on the controlled machine.

## 2026-07-17 — Dual deterministic policy

**Decision:** Enforce safety in both the TypeScript gateway and .NET agent, with the .NET agent as final authority.

**Reason:** A gateway mistake or alternate client must not expose the machine.

## 2026-07-17 — Fake provider before Windows provider

**Decision:** Use the fake provider for the full CI chain and make the Windows provider opt-in.

**Reason:** This follows Parts & Pieces desktop-harness guidance and separates software correctness from interactive OS behavior.

## 2026-07-17 — Semantic UI Automation before raw input

**Decision:** Implement UI Automation observation and semantic patterns first. Include trajectory math only; do not inject mouse or keyboard input.

**Reason:** Semantic actions are more stable and verifiable. Broad raw input is critical risk and requires a later local audit.

**Status:** Superseded by the later restart-gated standard-Windows motor decision below. The ordering principle remains active: semantic operation is preferred over physical input.

## 2026-07-17 — Proposal and execution are separate tools

**Decision:** ChatGPT must propose an action, receive the local decision, and then execute the proposal separately.

**Reason:** This creates a clear approval boundary and prevents a single tool call from combining intent, permission, and irreversible execution.

## 2026-07-17 — Full control is local-only and unavailable in MVP

**Decision:** Neither MCP nor the local web panel can enable full control.

**Reason:** A remote/model-facing switch would undermine the central trust boundary.

**Status:** Partially superseded. Full-control implementation now exists, but the central restriction remains: it can only be activated by an exact local restart configuration and cannot be enabled through MCP or the panel.

## 2026-07-17 — Hash-chain both audit layers

**Decision:** Maintain separate redacted hash chains in the gateway and agent.

**Reason:** The system needs evidence of both model-facing decisions and local execution, and neither layer should silently rewrite history.

## 2026-07-17 — Standard Windows motor is transparent and restart-gated

**Decision:** Implement bounded pointer movement, left click, Unicode typing, and a small hotkey allowlist through documented Windows APIs. Activate the motor only when the process starts with the Windows provider, both exact risk acknowledgements, physical input enabled, `full_control`, and a non-empty process allowlist.

**Reason:** The user requires a complete computer body, but physical input is a critical-risk fallback. Restart-only composition, active-window/process/coordinate/focus checks, typed local approval, verification, deadlines, audit, and emergency stop preserve the local trust boundary.

## 2026-07-17 — One authoritative execution tool

**Decision:** Keep separate semantic and physical proposal tools if useful for clarity, but route all returned proposals through one authoritative execution tool and one local policy path.

**Reason:** Multiple execution paths create opportunities for inconsistent approval, verification, or audit behavior.

## 2026-07-17 — Master System Roadmap is the planning authority

**Decision:** `docs/MASTER_SYSTEM_ROADMAP.md` controls future feature order, dependencies, evidence levels, and promotion gates. `docs/ARCHITECTURE.md` describes only implemented architecture; `docs/CODEX_HANDOFF.md` covers only the immediate local acceptance phase.

**Reason:** Future-work lists had become distributed across architecture, audit, README, and handoff documents. One authoritative roadmap prevents contradictory claims and makes multi-window, virtual-desktop, multi-agent, browser, visual, skills, packaging, and production work traceable.

## 2026-07-17 — Multi-window reasoning is parallel; physical execution is serialized per session

**Decision:** The future coordinator may observe and plan across many windows concurrently, but foreground focus and physical input use one exclusive lease per interactive Windows session. Genuine physical parallelism requires separate agents or Windows sessions.

**Reason:** One interactive session has one foreground focus and one physical input stream. Pretending otherwise would produce race conditions and unreliable execution.

## 2026-07-17 — One agent runs inside each controlled VM or remote session

**Decision:** Multi-VM and remote-session support will use a supervisor coordinating an Exosuit agent inside every controlled Windows session. The host must not treat a VM display window as semantic access to the guest desktop.

**Reason:** UI Automation, focus, input, and approval are session-bound. Per-session agents preserve correct identity, policy, interruption, and audit boundaries.
