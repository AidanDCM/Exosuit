# Exosuit

Exosuit is a local-first, model-independent computer embodiment runtime. It lets an authorized AI pilot such as ChatGPT use narrow, auditable MCP tools while the user's own Windows machine retains control of sensing, permissions, motion, verification, approvals, and emergency stopping.

## Product law

```text
Brain proposes.
Exosuit validates.
The local policy engine allows, asks, or blocks.
The local desktop provider executes only an allowed proposal.
Verification checks what actually happened.
A tamper-evident ledger records the chain.
```

The model never owns permission, credentials, unrestricted mouse/keyboard access, or the emergency stop.

## Current GitHub phase

This repository is designed so most of the system can be built and validated without touching a real desktop:

- shared typed contracts
- deterministic safety policy
- prompt-injection warning scanner
- loop and step-budget controls
- hash-chained audit ledger
- fake desktop provider
- loopback Windows agent protocol
- MCP server for ChatGPT developer mode
- system-pulse end-to-end tests
- Windows UI Automation provider compiled but disabled by default
- local control/status panel and emergency stop
- CI for TypeScript and Windows/.NET

Real Windows interaction remains unvalidated until the Codex/local phase.

## Architecture

```text
ChatGPT / another MCP host
          |
          | MCP (stdio through Secure MCP Tunnel, or a future streaming HTTP transport)
          v
Exosuit MCP server (Node/TypeScript)
          |
          | authenticated loopback HTTP
          v
Exosuit Windows agent (.NET, 127.0.0.1 only)
   |             |              |
policy       audit ledger    provider interface
                                  |
                      fake provider | Windows UI Automation
```

The MCP server issues meaningful semantic operations. It does not stream individual cursor pixels. Smooth movement and immediate stopping belong to the local motor layer.

## Safety defaults

- provider defaults to `fake`
- control mode defaults to `observe`
- physical input defaults to disabled
- full-control mode cannot be enabled through MCP
- unknown actions are blocked
- sensitive and destructive targets are blocked or require local approval
- screenshots are omitted unless explicitly enabled locally
- the agent binds only to `127.0.0.1`
- every non-health agent endpoint requires a strong shared token
- emergency stop is local and deterministic

Exosuit is not intended to evade automation detection, anti-cheat systems, access controls, or application policies.

## TypeScript development

```bash
npm install
npm run typecheck
npm test
npm run build
npm run test:pulse
```

Run the MCP server against the simulated desktop:

```bash
EXOSUIT_AGENT_MODE=fake npm run dev:mcp
```

Run against the local Windows agent:

```bash
EXOSUIT_AGENT_MODE=http \
EXOSUIT_AGENT_URL=http://127.0.0.1:43117 \
EXOSUIT_AGENT_TOKEN=<strong-random-token> \
npm run dev:mcp
```

On PowerShell, set the same values with `$env:NAME = "value"`.

## Windows agent development

```bash
dotnet build apps/windows-agent/Exosuit.Agent.csproj
dotnet test apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj
```

The agent refuses to start without `EXOSUIT_AGENT_TOKEN` of at least 32 characters. It uses the fake provider unless `EXOSUIT_PROVIDER=windows` is explicitly set. Physical input additionally requires `EXOSUIT_ENABLE_PHYSICAL_INPUT=true` and an approved local mode.

## Connecting ChatGPT

The intended private route is OpenAI Secure MCP Tunnel using the MCP server as a local stdio command. Current OpenAI documentation says ChatGPT developer mode supports read and write MCP tools, while Secure MCP Tunnel keeps the private server inside the user's network and uses an outbound connection.

- https://developers.openai.com/api/docs/guides/developer-mode
- https://developers.openai.com/api/docs/guides/secure-mcp-tunnels
- https://developers.openai.com/apps-sdk/build/mcp-server
- https://developers.openai.com/apps-sdk/plan/tools

Exact tunnel setup is deferred to the Codex/local validation phase because it requires the user's machine, OpenAI organization/workspace access, and local credentials.

## Donor systems considered

- `AidanDCM/Parts-and-Pieces`
- `AidanDCM/AI-Desktop-Operating-System-`
- `AidanDCM/mcp-platform`
- `AidanDCM/Dev-Orchestrator`
- `AidanDCM/Pokemon-yellow-bot`
- audit patterns harvested from `AidanDCM/Futures-Trading` through Parts & Pieces

See `docs/PARTS_REUSE_ADR.md` for what was reused, adapted, or rejected.

## Read before changing execution code

1. `AGENTS.md`
2. `DEVELOPER_OPERATING_SYSTEM.md`
3. `OWNER_MANUAL.md`
4. `docs/ARCHITECTURE.md`
5. `docs/SECURITY_MODEL.md`
6. `docs/TEST_PLAN.md`
7. `docs/qa/ATOMIC_AUDIT_BASELINE.md`

No claim of live desktop readiness is valid until the Codex handoff checks in `docs/CODEX_HANDOFF.md` are completed with evidence.
