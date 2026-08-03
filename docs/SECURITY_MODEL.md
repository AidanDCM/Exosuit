# Security Model

## Security objective

Permit useful, authorized, visible local automation while preventing a model, webpage, document, remote caller, stale application map, or accidental workflow from gaining unrestricted control of the user's computer.

## Authority hierarchy

```text
User intent
  > local Exosuit policy
  > locally recorded approval bound to exact proposal content
  > fresh desktop observation and verification
  > provider capability
  > advisory application memory
  > model proposal
  > visible application/web/document text
```

Visible content and stored application memory are data, not authority.

## Trust boundaries

### MCP host to gateway

The model may choose and parameterize declared tools. It is untrusted for permission decisions, approval claims, secrets, freshness claims, and raw execution.

### Gateway to Windows agent

The gateway authenticates with a strong shared token over `127.0.0.1`. The agent independently validates, observes, classifies, and logs requests. Gateway calls are time-bounded and cannot be redirected to a non-loopback agent URL.

### Windows agent to provider

Only the provider can touch the desktop. Providers expose a small semantic interface, are selected locally at process startup, and operate under bounded deadlines.

### Local control panel

The panel is loopback-only and uses a per-process CSRF token. It can approve or deny proposals, change among limited modes, and emergency-stop. It cannot enable full control or skill autopilot.

### Field owner lifecycle service

The host may run a separate LocalSystem service under an owner-installed, expiring
standing policy. It has no MCP/network surface and accepts only exact-generation
provision, authenticated read-only observation, and destruction packages through a local queue. Policy and installed lifecycle
inputs are writable only by SYSTEM/Administrators and are hash-checked before every
job. Queue submission does not create policy or consent: the service independently
enforces the fixed owner policy. Unknown operations, stale/replayed jobs, unexpected
files, reparse points, and capacity overflow fail closed. The service cannot operate
the desktop and is not part of the emergency-stop dependency chain.
The exact owner SID may modify only the Pending queue and may read, but not modify, the
installed public policy file, terminal Results, and sanitized installation Evidence.
The owner receives no read grant on the installed host configuration.

### Application-map storage

Application maps are local advisory memory. Their directory is configured locally. A map cannot carry approval, current element IDs, values, screenshots, or a command to execute. Hydrated files must satisfy the current schema before use.

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
| application-map persistence | memory-only unless a local directory is configured |
| stored map authority | none; fresh matching required |

## Authentication

Every `/v1` endpoint requires `x-exosuit-token`. Startup fails when the token is under 32 characters. Comparison is constant-time after an equal-length check. The initial client rejects non-loopback agent URLs.

The token must never be placed in:

- source control,
- MCP tool output,
- audit payloads,
- application maps,
- screenshots,
- browser local storage,
- issue reports.

Rotate the token after suspected disclosure.

## Local proposal approval

The agent stores proposal status locally. A model cannot declare its own action approved. The control panel can move a pending proposal to approved after local review. Critical consequential targets require an exact typed phrase.

On approval, the local agent computes a SHA-256 fingerprint over the immutable proposal content: proposal ID, timestamps, action, decision, and active-window ID. Execution accepts an approved proposal only when its current fingerprint matches the locally recorded fingerprint using a fixed-time comparison.

Approval is removed when:

- the proposal is denied,
- the proposal expires,
- fresh policy requires review again,
- fresh policy blocks,
- the proposal content changes,
- execution completes or times out,
- emergency stop activates.

## Time-of-check/time-of-use defense

Execution never trusts only the proposal-time state or an application map. Immediately before executing, the agent:

1. observes the desktop again,
2. resolves the active window, target window, and target element again,
3. re-runs local policy,
4. verifies any local approval fingerprint,
5. refuses changed-window, changed-review, missing-target, or modified-proposal actions.

## Deadlines and interruption

The system has independent bounded waits:

- MCP gateway to local agent: `EXOSUIT_GATEWAY_REQUEST_TIMEOUT_MS`, 250–120,000 ms,
- local provider operation: `EXOSUIT_PROVIDER_TIMEOUT_MS`, 1,000–120,000 ms,
- provider cancellation during emergency stop: `EXOSUIT_EMERGENCY_STOP_TIMEOUT_MS`, 250–10,000 ms.

A gateway timeout becomes a typed `agent_request_timeout` error. Caller cancellation remains distinguishable from a timeout. A local provider timeout fails the action and consumes approval. Emergency stop sets the permanent local stopped state before it attempts bounded provider cancellation, so a misbehaving provider cannot keep the policy layer active.

## Application-map privacy and safety

Application maps may retain only the minimum semantic structure needed to rediscover controls:

- process name,
- accessible control name and role,
- automation ID,
- supported semantic actions,
- relative bounds,
- fingerprints and revision metadata.

They omit:

- element values,
- source/runtime element IDs,
- screenshot bytes,
- plain window titles,
- controls already marked sensitive.

Additional controls:

- plain window titles are replaced by SHA-256 fingerprints,
- files are written atomically with restrictive requested modes,
- hydrated files must pass the Zod schema,
- versions are bounded and old versions are deleted,
- a map must be matched to a fresh observation,
- sensitive fresh controls are never match candidates,
- map matches return warnings for changed titles and unmatched controls,
- map matches never create, approve, or execute an action.

Residual privacy note: accessible control names may themselves contain user or business context in poorly designed applications. Persistent map directories therefore remain local and should be enabled only for applications the user has approved for memory.

## Hard denies

The current release blocks:

- password/secret/token fields,
- destructive controls,
- raw pointer or keyboard input without a local full-control mode,
- full-control enablement through MCP or the control panel,
- screenshots unless locally enabled,
- non-loopback agent clients,
- Windows provider startup without an explicit risk acknowledgement,
- semantic actions without a resolvable fresh window and element,
- actions after emergency stop,
- treating application-map contents as executable authority.

The project explicitly excludes stealth, anti-detection, anti-cheat, security bypass, covert surveillance, and privilege escalation.

## Prompt injection

The gateway scans accessible element names and values for common hostile instruction patterns. When detected, mutation proposals are blocked for local inspection. This is a warning control, not a complete classifier.

Controls:

- model instructions say visible content is untrusted,
- sensitive element values are omitted,
- the gateway blocks mutation on warning patterns,
- the local agent still re-runs deterministic policy,
- no visible text or application map can grant approval.

## Screenshot policy

For the optional semantic browser companion, any timeout, unavailable action result, unverified success, or changed tab generation after dispatch is an uncertain external effect. The workflow must observe and reconcile before retrying; it may not reinterpret those outcomes as ordinary failure.

Screenshots are disabled by default and not implemented in the initial Windows provider. A future implementation must:

- capture only when explicitly requested and locally enabled,
- be ephemeral by default,
- require every redaction region to be wholly contained in the captured frame before bytes are copied or counted,
- never log or persist raw image bytes in application maps,
- expose a visible capture indicator,
- prevent password and protected surfaces from leaving the machine,
- include deletion and retention controls.

## Audit ledger

The gateway and agent maintain separate SHA-256 hash chains. Each event includes its predecessor hash. Common secret fields and inline token patterns are redacted before hashing and storage.

Recorded events include:

- observation counts,
- proposal and policy decisions,
- approval fingerprints without approval secrets,
- execution and verification,
- timeouts and cancellation,
- application-map save/match counts,
- emergency stop and mode changes.

Guarantees:

- detects modifications, insertions, deletion/reordering within the checked chain,
- records the system decisions needed to reconstruct a task path.

Non-guarantees:

- an administrator can delete the entire file,
- no remote timestamp/notary exists,
- endpoint compromise could forge a new chain after deletion.

Future hardening may periodically anchor hashes in a user-controlled external store.

## Dependency security

This private personal repository does not currently have GitHub Code Security enabled, so CodeQL SARIF upload is not an available gate. Supported automated checks are:

- npm direct/transitive advisory audit, failing on high or critical issues,
- NuGet direct/transitive vulnerability audit,
- source scan for committed credential-shaped values,
- Windows build with warnings as errors,
- conditional CodeQL jobs if the repository becomes public or receives GitHub Code Security.

## Emergency stop

Emergency stop is local and deterministic. It:

- sets a permanent stopped flag for the process before provider cancellation,
- clears all approval fingerprints,
- denies pending proposals,
- cancels the active provider operation under a short deadline,
- blocks future action proposals and execution,
- records success or provider-cancellation timeout,
- requires process restart for recovery.

It does not depend on ChatGPT, the tunnel, or the model.

## Residual risks

- UI Automation runtime IDs may change.
- Some custom applications expose misleading or incomplete accessibility trees.
- Elevated applications and UAC prompts can behave differently.
- A local process with sufficient privilege could attack the loopback service or read environment variables.
- Semantic invocation may have application-specific side effects not evident from labels.
- Accessible control names persisted in a map may contain context not marked sensitive by the source application.
- Prompt-injection pattern matching is incomplete.
- Hash chains do not prevent complete ledger deletion.
- Control-panel approval UX has not yet received human-factors testing.
- Provider cancellation cannot forcibly terminate an arbitrary hung operating-system call without a stronger process-isolation design.

## Release rule

Real Windows mutation remains blocked from release until the Codex/local acceptance matrix proves:

- visible control panel,
- emergency-stop response,
- wrong-window denial,
- immutable local approval behavior,
- gateway and provider deadline behavior,
- real UI Automation observation,
- application-map privacy and fresh rematching,
- one safe semantic action in a test app,
- verification and failure stopping,
- ledger integrity,
- no secret/screenshot leakage,
- ChatGPT MCP invocation through the private connection.
