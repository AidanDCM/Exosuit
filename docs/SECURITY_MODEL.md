# Security Model

## Security objective

Permit useful, authorized, visible local automation while preventing a model, webpage, document, remote caller, or accidental workflow from gaining unrestricted control of the user's computer.

## Authority hierarchy

```text
User intent
  > local Exosuit policy
  > locally recorded approval
  > provider capability
  > model proposal
  > visible application/web/document text
```

Visible content is data, not authority.

## Trust boundaries

### MCP host to gateway

The model may choose and parameterize declared tools. It is untrusted for permission decisions, approval claims, secrets, and raw execution.

### Gateway to Windows agent

The gateway authenticates with a strong shared token over `127.0.0.1`. The agent independently validates, observes, classifies, and logs requests.

### Windows agent to provider

Only the provider can touch the desktop. Providers expose a small semantic interface and are selected locally at process startup.

### Local control panel

The panel is loopback-only and uses a per-process CSRF token. It can approve or deny proposals, change among limited modes, and emergency-stop. It cannot enable full control or skill autopilot.

## Default-deny configuration

| Capability | Default |
|---|---|
| provider | fake |
| mode | sandbox for fake; observe for Windows |
| bind address | 127.0.0.1 |
| screenshots | disabled |
| physical input | disabled |
| full control | disabled and not remotely enableable |
| credentials | hard denied |
| destructive targets | hard denied |
| unknown actions | blocked |
| unallowlisted Windows process | blocked in scoped mode |

## Authentication

Every `/v1` endpoint requires `x-exosuit-token`. Startup fails when the token is under 32 characters. Comparison is constant-time after an equal-length check. The initial client rejects non-loopback agent URLs.

The token must never be placed in:

- source control,
- MCP tool output,
- audit payloads,
- screenshots,
- browser local storage,
- issue reports.

Rotate the token after suspected disclosure.

## Local proposal approval

The agent stores proposal status locally. A model cannot declare its own action approved. The control panel can move a pending proposal to approved after local review. Critical consequential targets require an exact typed phrase.

Approvals expire with the proposal after five minutes and are invalidated by fresh policy failure.

## Time-of-check/time-of-use defense

Execution never trusts only the proposal-time state. Immediately before executing, the agent:

1. observes the desktop again,
2. resolves the active window, target window, and target element again,
3. re-runs local policy,
4. refuses changed-window or missing-target actions.

## Hard denies

The current release blocks:

- password/secret/token fields,
- destructive controls,
- raw pointer or keyboard input without a local full-control mode,
- full-control enablement through MCP or the control panel,
- screenshots unless locally enabled,
- non-loopback agent clients,
- Windows provider startup without an explicit risk acknowledgement,
- semantic actions without a resolvable window and element,
- actions after emergency stop.

The project explicitly excludes stealth, anti-detection, anti-cheat, security bypass, covert surveillance, and privilege escalation.

## Prompt injection

The gateway scans accessible element names and values for common hostile instruction patterns. When detected, mutation proposals are blocked for local inspection. This is a warning control, not a complete classifier.

Controls:

- model instructions say visible content is untrusted,
- sensitive element values are omitted,
- the gateway blocks mutation on warning patterns,
- the local agent still re-runs deterministic policy,
- no visible text can grant approval.

## Screenshot policy

Screenshots are disabled by default and not implemented in the initial Windows provider. A future implementation must:

- capture only when explicitly requested and locally enabled,
- be ephemeral by default,
- support region redaction,
- never log raw image bytes,
- expose a visible capture indicator,
- prevent password and protected surfaces from leaving the machine,
- include deletion and retention controls.

## Audit ledger

The gateway and agent maintain separate SHA-256 hash chains. Each event includes its predecessor hash. Common secret fields and inline token patterns are redacted before hashing and storage.

Guarantees:

- detects modifications, insertions, deletion/reordering within the checked chain,
- records proposal, decision, result, verification, stop, and mode events.

Non-guarantees:

- an administrator can delete the entire file,
- no remote timestamp/notary exists,
- endpoint compromise could forge a new chain after deletion.

Future hardening may periodically anchor hashes in a user-controlled external store.

## Emergency stop

Emergency stop is local and deterministic. It:

- sets a permanent stopped flag for the process,
- denies pending proposals,
- cancels the active provider operation when possible,
- blocks future action proposals and execution,
- records an event,
- requires process restart for recovery.

It does not depend on ChatGPT, the tunnel, or the model.

## Residual risks

- UI Automation runtime IDs may change.
- Some custom applications expose misleading or incomplete accessibility trees.
- Elevated applications and UAC prompts can behave differently.
- A local process with sufficient privilege could attack the loopback service or read environment variables.
- Semantic invocation may have application-specific side effects not evident from labels.
- Prompt-injection pattern matching is incomplete.
- Hash chains do not prevent complete ledger deletion.
- Control-panel approval UX has not yet received human-factors testing.

## Release rule

Real Windows mutation remains blocked from release until the Codex/local acceptance matrix proves:

- visible control panel,
- emergency-stop response,
- wrong-window denial,
- local approval behavior,
- real UI Automation observation,
- one safe semantic action in a test app,
- verification and failure stopping,
- ledger integrity,
- no secret/screenshot leakage,
- ChatGPT MCP invocation through the private connection.
