# Security Review — The 74 Commits That Landed Without CI

**Date:** 2026-07-28
**Reviewer:** automated review at owner request
**Scope:** `d48cbc7..5302cf0`, the coordinator, supervisor, virtual-desktop, browser, skill, performance, and support-bundle expansion
**Why:** hosted CI was blocked by account billing throughout this window, so no automated gate ran against any of it. Two defects from that window were already fixed in `c756802`.
**Evidence class:** static review plus targeted runtime probes against built output; no hosted CI, no Windows-provider, no ChatGPT evidence

## Verdict

**One medium finding, fixed. No critical or high findings.**

The security-critical primitives in this body of work are, on inspection, better than the circumstances would predict. Crypto, authentication, signing, and capture gating each hold up. The one real defect was not in a primitive but at a boundary: a field whose *name* implied enumerated identifiers was *typed* as free text, in the one artifact designed to leave the machine.

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
- Nonce is recorded only after the signature verifies, so an unauthenticated caller cannot poison the cache.

Residual, not a finding: the skew and contract-range checks run before signature verification, so an attacker can distinguish "bad timestamp" from "bad signature". Low value to an attacker.

### `src/skills.ts`

- Ed25519 via `sign(null, …)` / `verify(null, …)`. Passing `null` for the digest structurally rules out the algorithm-confusion class.
- `keyId` is inside the signed payload and must already be present in the trusted key map, so it cannot be swapped to an untrusted key.
- Sign and verify canonicalize the same unsigned object, so the signed bytes match exactly.
- At least one trusted public key is required at construction.

### `src/visualPrivacy.ts`

Capture is off by default and, when disabled, throws. When enabled it additionally requires explicit local task approval, a visible indicator, an unexpired consent lease, a region within approved bounds, matching task and window scope, and a non-exhausted frame budget. Correctly gated, and consistent with the roadmap keeping Phase 6 at `proposed`.

## Finding — support bundles could carry arbitrary private content

**Severity:** medium. **Status:** fixed in this slice.

`recentErrorCodes` was declared as `z.string().min(1).max(200)`: free text. The field name says *codes*, the fixture used one (`virtual_desktop_unavailable`), and the only value screening was a denylist matching credential shapes — `Bearer …`, `sk-…`, PEM headers.

A denylist cannot solve this. It can match a credential, but not a file path containing a user name, a window title containing a patient name, or a URL containing an email address. Those are exactly what raw exception messages contain, and "put the error message in `recentErrorCodes`" is the natural thing for a caller to do.

Reproduced against built output before the fix. All three of these were accepted **and passed `verifySupportBundle`**:

```text
Failed to open C:\Users\Aidan\Documents\2025 Tax Return - SSN 123-45-6789.pdf
UIA element 'Patient: Jane Doe, DOB 1984-03-02' absent from window 'Epic - Chart Review'
Timeout contacting https://internal.acme.example/api?employee=aidan.miller@acme.example
```

This matters more than a typical schema looseness because the support bundle is the one artifact in the system explicitly designed to be handed to someone else. The surrounding module is otherwise careful — `.strict()` schemas rejecting unknown fields, a key denylist, agent IDs required to be hashes, `0o600` output, an integrity hash. This field was the gap in an otherwise tight boundary.

It was **latent, not live**: nothing currently populates a bundle. It would have become live at the first caller.

### Fix

An allowlist, because a denylist cannot express "no prose":

```text
/^[A-Za-z0-9_.-]{1,64}$/
```

Rejecting spaces does the work. Applied to `recentErrorCodes` and, as the same class of defect, to `performanceSummary[].metric` and the record keys of `workflowStates`, `auditSummary.eventTypes`, and `configurationFlags`. Every existing fixture already satisfied it.

Fields that legitimately carry prose — `platform`, `provider`, `mode`, `exosuitVersion`, and the per-agent strings — remain free text and remain covered by the value denylist.

The original proof was re-run against the fixed build and is now rejected at schema parse.

## Not reviewed

- `src/supervisor.ts`, `supervisorRouter.ts`, `supervisorStore.ts` beyond their authentication path.
- `src/browserCompanionGuard.ts` beyond the origin and sensitive-field checks already covered by tests.
- `src/resourceGovernance.ts` and `performance.ts`, other than the scheduler work recorded separately.
- The .NET agent, unchanged in this window.
- Dependency supply chain, covered separately by the npm and NuGet audits, both currently clean.

This was a targeted review of the highest-risk surfaces, not an exhaustive audit. Phase 12 still requires a full threat model, and nothing here substitutes for it.

## Recommendations

1. **Set a maximum workflow length.** Unbounded superlinear scheduler cost is a denial-of-service shape. Already a listed Phase 10 deliverable.
2. **Record the GCM IV bound** in the Phase 12 threat model rather than relying on it staying implausible.
3. **When a support-bundle caller is written, pass codes and not messages.** The schema now enforces that, but the caller should be reviewed at the point it is added.
4. **Restore hosted CI.** The single largest security control still missing is an automated gate. This review was possible only because someone asked for it; CI would have run unprompted.
