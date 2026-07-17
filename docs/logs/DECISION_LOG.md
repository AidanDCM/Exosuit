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

## 2026-07-17 — Proposal and execution are separate tools

**Decision:** ChatGPT must propose an action, receive the local decision, and then execute the proposal separately.

**Reason:** This creates a clear approval boundary and prevents a single tool call from combining intent, permission, and irreversible execution.

## 2026-07-17 — Full control is local-only and unavailable in MVP

**Decision:** Neither MCP nor the local web panel can enable full control.

**Reason:** A remote/model-facing switch would undermine the central trust boundary.

## 2026-07-17 — Hash-chain both audit layers

**Decision:** Maintain separate redacted hash chains in the gateway and agent.

**Reason:** The system needs evidence of both model-facing decisions and local execution, and neither layer should silently rewrite history.
