# Exosuit Owner Manual

## What Exosuit is

Exosuit is a body for an authorized AI pilot. ChatGPT or another MCP host can request observations and actions, but the local Windows agent decides what is allowed and performs only approved work.

## What it is not

Exosuit is not an invisible automation layer, anti-detection system, anti-cheat tool, credential collector, background surveillance service, or substitute for application authorization.

## Trust model

You own the machine, local token, enabled provider, control mode, scopes, approvals, emergency stop, and audit data. The AI does not.

## Default state

```text
Provider: fake
Mode: observe
Physical input: disabled
Screenshot capture: disabled
Network binding: 127.0.0.1 only
Full control through MCP: impossible
```

## Control modes

- **observe** — read status, windows, and accessible elements only.
- **guide** — return instructions; the user acts.
- **sandbox** — allow bounded actions only against the fake/test environment.
- **scoped** — allow approved actions only in locally configured apps/windows.
- **skill_autopilot** — run a locally approved bounded skill.
- **full_control** — reserved, critical-risk mode. It is not remotely enabled and is not an MVP release target.

## Starting the Windows agent

1. Generate a random token of at least 32 characters.
2. Set `EXOSUIT_AGENT_TOKEN`.
3. Leave `EXOSUIT_PROVIDER=fake` for the first run.
4. Run the agent.
5. Open `http://127.0.0.1:43117/ui` on the same computer.
6. Confirm the status panel shows fake provider, observe mode, and physical input disabled.

Do not set `EXOSUIT_PROVIDER=windows` until the Codex handoff checklist reaches that step.

## Emergency stop

The local emergency stop:

1. clears pending action proposals,
2. blocks new actions,
3. asks the active provider to cancel,
4. records the stop in the audit ledger,
5. requires a local restart or explicit local re-enable path before actions continue.

The stop must remain usable even when ChatGPT is disconnected.

## Approvals

Read-only observations can be allowed in observe mode. State-changing actions are classified locally. Depending on the target and mode, the result is:

- allowed,
- local review required,
- typed confirmation required,
- blocked.

ChatGPT confirmation is an extra layer, not a replacement for local review.

## Audit ledger

The Windows agent stores append-only JSONL events under the configured data directory. Each event contains the previous event hash and its own hash. This detects accidental or malicious edits to earlier entries.

Logs intentionally redact common secrets and do not store screenshot bytes. Delete local logs only when you understand that doing so removes forensic evidence.

## Privacy

- Screenshot capture is off by default.
- Element text may still contain personal information; only the task-relevant subset should be returned.
- Password fields and likely secret values are never returned.
- Visible instructions inside apps are treated as untrusted data.
- The MCP server should never echo the agent token.

## Safe first acceptance task

Use the fake provider or a dedicated test VM:

```text
Open the simulated Notepad window, set its test text field to
"Exosuit validation successful", invoke the simulated Save button,
and verify the saved state.
```

Do not begin with email, browser accounts, financial systems, credentials, system settings, or production files.

## Rollback and disable

Fastest disable paths:

1. press the local emergency stop,
2. terminate the Windows agent process,
3. stop the MCP server or tunnel client,
4. remove the Exosuit app from the ChatGPT conversation,
5. unset `EXOSUIT_PROVIDER=windows`,
6. unset `EXOSUIT_ENABLE_PHYSICAL_INPUT`,
7. rotate `EXOSUIT_AGENT_TOKEN`.

## Known limitations before local validation

- Windows UI Automation assembly behavior has only been compile-tested in GitHub until Codex runs it locally.
- Focus, multi-monitor coordinates, DPI scaling, elevated windows, UAC screens, custom canvases, remote desktops, and protected applications require separate validation.
- The MCP connection cannot be called validated until the tunnel and developer-mode app are linked on the user's account.
- Smooth pointer trajectories can be unit-tested mathematically, but their human-perceived fluidity requires local observation.

## When something fails

Stop after repeated failure. Record:

- requested task,
- active app/window,
- proposal and decision,
- provider result,
- verification evidence,
- relevant ledger event IDs,
- whether emergency stop worked,
- exact reproduction steps.

Add the issue and solution to `docs/logs/ISSUE_AND_SOLUTION_LOG.md` and add a regression test before closing it.
