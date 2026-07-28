# Security Review — The 74 Commits That Landed Without CI

**Date:** 2026-07-28
**Reviewer:** automated review at owner request
**Scope:** `d48cbc7..5302cf0`, the coordinator, supervisor, virtual-desktop, browser, skill, performance, and support-bundle expansion
**Why:** hosted CI was blocked by account billing throughout this window, so no automated gate ran against any of it. Two defects from that window were already fixed in `c756802`.
**Evidence class:** static review plus targeted runtime probes against built output; no hosted CI, no Windows-provider, no ChatGPT evidence

## Verdict

**One high finding and one medium finding, both fixed. No critical findings.**

The security-critical primitives in this body of work are, on inspection, better than the circumstances would predict. Crypto, authentication, signing, and capture gating each hold up. Neither defect was in a primitive. Both were at a boundary, and both were of the same shape: a name that promised one thing while the code permitted another.

## Finding 1 — a global stop did not durably stop an unreachable agent

**Severity:** high. **Status:** fixed in this slice.

`AgentRegistry.stopAll()` skipped any agent whose health was `offline`, recording it in `alreadyUnavailable` and leaving its state untouched.

`offline` does not mean the agent halted. It means Exosuit stopped receiving heartbeats, which equally describes a network partition, a suspended VM, or a hung host. Such an agent may still be running and driving a real desktop with physical input armed.

Because a skipped agent stayed `offline` rather than `stopped`, and `heartbeat()` only refuses agents already in state `stopped`, a reconnecting agent walked straight back to `online` and became eligible for new work. Demonstrated against built output before the fix:

```text
1. registered            -> online
2. missed heartbeats     -> offline
3. stopAll()             -> stopped: [] | alreadyUnavailable: [ agent-vm-1 ]
   agent state after stopAll -> offline
4. heartbeat after stop  -> ACCEPTED, state: online
5. select() for work     -> SELECTED agent-vm-1
```

This contradicts several stated invariants: `AGENTS.md` law 7, that emergency stop must not depend on the current action succeeding; the roadmap Execution invariant that emergency stop is local and deterministic; and the Phase 4 deliverable for a global stop-all operation.

Two `stopAll` implementations existed with different semantics. `SupervisorRouter.stopAll` iterates every registered agent and calls `registry.stop()` unconditionally, which is correct. `AgentRegistry.stopAll` did not, and `PersistentAgentRegistry` exposes that one — so the durable path carried the weaker behaviour and persisted it across a supervisor restart.

**Exposure:** latent. Phase 4 has no production transport and no real agents, so nothing was running under this. It would have become live at the first real multi-agent deployment, which is precisely when an emergency stop matters most.

### Fix

`stopAll` now stops every agent that is not already `stopped`, including offline ones, and reports the offline ones in `unreachable`. The field was renamed from `alreadyUnavailable` because the old name asserted something false: the agent was not already unavailable, it was merely unconfirmed. Recording an agent as unreachable is now a statement about acknowledgement, never a reason to leave it running.

Two existing tests encoded the unsafe behaviour, including one asserting that agents remain `offline` after a global stop **and a supervisor restart**. Both were corrected rather than relaxed, and a regression test now covers the full partition, stop, reconnect sequence.

## Finding 2 — support bundles could carry arbitrary private content

**Severity:** medium. **Status:** fixed in this slice.

`recentErrorCodes` was declared as `z.string().min(1).max(200)`: free text. The field name says *codes*, the fixture used one (`virtual_desktop_unavailable`), and the only value screening was a denylist matching credential shapes — `Bearer …`, `sk-…`, PEM headers.

A denylist cannot solve this. It can match a credential, but not a file path containing a user name, a window title containing a patient name, or a URL containing an email address. Those are exactly what raw exception messages contain, and "put the error message in `recentErrorCodes`" is the natural thing for a caller to do.

Reproduced against built output before the fix. All three of these were accepted **and passed `verifySupportBundle`**:

```text
Failed to open C:\Users\Aidan\Documents\2025 Tax Return - SSN 123-45-6789.pdf
UIA element 'Patient: Jane Doe, DOB 1984-03-02' absent from window 'Epic - Chart Review'
Timeout contacting https://internal.acme.example/api?employee=aidan.miller@acme.example
```

This matters more than typical schema looseness because the support bundle is the one artifact in the system explicitly designed to be handed to someone else. The surrounding module is otherwise careful — `.strict()` schemas rejecting unknown fields, a key denylist, agent IDs required to be hashes, `0o600` output, an integrity hash. This field was the gap in an otherwise tight boundary.

**Exposure:** latent. Nothing currently populates a bundle. It would have become live at the first caller.

### Fix

An allowlist, because a denylist cannot express "no prose":

```text
/^[A-Za-z0-9_.-]{1,64}$/
```

Rejecting spaces does the work. Applied to `recentErrorCodes` and, as the same class of defect, to `performanceSummary[].metric` and the record keys of `workflowStates`, `auditSummary.eventTypes`, and `configurationFlags`. Every existing fixture already satisfied it.

Fields that legitimately carry prose — `platform`, `provider`, `mode`, `exosuitVersion`, and the per-agent strings — remain free text and remain covered by the value denylist.

The original proof was re-run against the fixed build and is now rejected at schema parse.

## Reviewed and found sound

### `src/encryptedCheckpointStore.ts`

- AES-256-GCM with a fresh 12-byte IV per save.
- AAD binds the format version and the workflow key, so an envelope cannot be replayed under a different identity.
- Auth-tag failure raises rather than returning partial plaintext.
- Key must decode to exactly 32 bytes.
- Files written `0o600`, atomically, via temp plus rename, with `flag: "wx"` so an existing temp is never clobbered.
- Paths derive from `sha256(workflowId)`, so a hostile workflow ID cannot traverse directories.
- `list()` deliberately swallows decrypt failures, so wrong-key or tampered files are never advertised as resumable.

Residual, not a finding: random 96-bit IVs are safe to roughly 2^32 messages per key. Checkpoint-per-step makes that reachable only in an implausibly long-lived deployment, but it belongs in the Phase 12 threat model rather than being forgotten.

### `src/agentChannelAuth.ts`

- HMAC-SHA256 over a canonical `stableStringify`, so key ordering cannot change the signed bytes.
- Secret must be at least 32 bytes.
- `timingSafeEqual` guarded by a length check, avoiding the throw-on-length-mismatch pitfall.
- Clock-skew window bounded to 1–300 s.
- Replay nonces retained for a period that must cover the skew window, enforced in the constructor.
- The nonce is recorded only after the signature verifies, so an unauthenticated caller cannot poison the cache.

Residual, not a finding: the skew and contract-range checks run before signature verification, so an attacker can distinguish "bad timestamp" from "bad signature". Low value to an attacker.

### `src/skills.ts`

- Ed25519 via `sign(null, …)` and `verify(null, …)`. Passing `null` for the digest structurally rules out the algorithm-confusion class.
- `keyId` is inside the signed payload and must already be present in the trusted key map, so it cannot be swapped to an untrusted key.
- Sign and verify canonicalize the same unsigned object, so the signed bytes match exactly.
- At least one trusted public key is required at construction.

### `src/visualPrivacy.ts`

Capture is off by default and, when disabled, throws. When enabled it additionally requires explicit local task approval, a visible indicator, an unexpired consent lease, a region within approved bounds, matching task and window scope, and a non-exhausted frame budget. Correctly gated, and consistent with the roadmap keeping Phase 6 at `proposed`.

### `src/supervisor.ts` and `src/agentRegistration.ts`

Aside from Finding 1:

- Registration is authenticated: `AuthenticatedAgentRegistrar` verifies the signed payload before the registry is touched.
- An agent ID cannot be rebound to a different machine or Windows session, which blocks takeover of an existing agent slot.
- `heartbeat` cannot declare `offline` or `stopped`; the type restricts it to `online` or `degraded`, so an agent cannot fake its own shutdown.
- A `stopped` agent must be re-registered, so recovery passes back through authentication.
- `select` returns only `online` agents inside their contract range holding every required capability.
- `expireStale` bounds its window to 1 s–1 h.

**Residual now closed (2026-07-28).** `heartbeat` accepted a `capabilities` array and replaced the stored list without signature verification, so any caller able to reach a future heartbeat endpoint could have enlarged an agent's capability set and redirected `select` routing to it.

Heartbeats are now signed and verified on the same path as registration: `signHeartbeat` / `verifyHeartbeat`, sharing one `#verifySigned` implementation so clock-skew bounds and replay protection cannot drift apart between the two message types. The signed payload carries `machineId` and `windowsSessionId`, and `AuthenticatedAgentRegistrar.heartbeat` refuses any heartbeat whose identity does not match what the agent registered under.

Adding a second signed message type under the same secret introduced a cross-protocol reuse risk that the original review did not name. Both message types now carry an explicit domain tag in the HMAC input, and the replay cache is keyed per domain.

### `src/browserCompanionGuard.ts`

- Provider output is re-parsed against the schema, so a compromised or buggy companion cannot inject unvalidated shapes.
- Observation and action results are bound to the requested identity: browser instance, tab, origin, and action ID.
- Tab generation may not move backwards.
- A result claiming `succeeded` without `verificationStatus: "passed"` is rejected.
- Operations are bounded by a configurable timeout with the timer cleared in `finally`.

Two design notes, not fixed, both inert while the companion is mock-only:

1. `withTimeout` races a promise but cannot cancel the underlying operation, so a timed-out browser action may still complete in the real browser. The guard surfaces that as a plain failure rather than as an uncertain external effect. The roadmap recovery rule states Exosuit must never assume a timed-out external action did not occur, and `workflowRuntime` already models `uncertain` outcomes. When browser actions are wired into workflows, timeouts should map to `uncertain`, not `failed`.
2. A result whose tab generation is **greater** than the action generation is accepted. That means the tab navigated during the action, so the result may describe a different page than the one acted upon. Origin equality is still enforced, which limits but does not eliminate the concern.

## Not reviewed

- `src/supervisorRouter.ts` beyond its stop path and response identity checks.
- `src/supervisorStore.ts` beyond the persistence of stop state.
- `src/resourceGovernance.ts` and `src/performance.ts`, other than the scheduler work recorded separately.
- `src/coordinator.ts` and `src/workflowRuntime.ts` lease and generation logic, covered by tests but not audited here.
- The .NET agent, unchanged in this window.
- Dependency supply chain, covered separately by the npm and NuGet audits, both currently clean.

This was a targeted review of the highest-risk surfaces, not an exhaustive audit. Phase 12 still requires a full threat model, and nothing here substitutes for it.

## Recommendations

1. **Sign heartbeats, or freeze capabilities between registrations**, before Phase 4 gains a real transport. This is the residual above and is the natural next hole once agents can actually talk.
2. **Map browser-companion timeouts to `uncertain`, not `failed`**, when browser actions are wired into workflows.
3. **Set a maximum workflow length.** Unbounded superlinear scheduler cost is a denial-of-service shape. Already a listed Phase 10 deliverable.
4. **Record the GCM IV bound** in the Phase 12 threat model rather than relying on it staying implausible.
5. **When a support-bundle caller is written, pass codes and not messages.** The schema now enforces that, but the caller should be reviewed at the point it is added.
6. **Restore hosted CI.** The single largest security control still missing is an automated gate. Both findings sat in code that no automated check ever ran against, and this review happened only because someone asked. CI would have run unprompted.
