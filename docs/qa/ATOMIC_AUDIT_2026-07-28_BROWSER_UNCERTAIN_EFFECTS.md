# Level 4 addendum: browser uncertain external effects

**Date:** 2026-07-28
**Subsystem:** optional Glove browser companion
**Capability change:** safer result classification; companion remains disabled and unintegrated

## Atomic unit

`GuardedBrowserCompanionProvider.execute` bounds a semantic browser action, validates returned action/tab identity, requires an exact tab generation, and enforces verification. `BrowserSemanticGateway.execute` applies origin, freshness, target, sensitive-field, capability, and prompt-injection policy before dispatch.

## Finding

The timeout wrapper cannot cancel the underlying provider promise. A timed-out action may later take effect. The gateway also mapped provider exceptions to `disconnected` and unverified provider success to `failed`; both labels can invite blind retry. Finally, the guard accepted a result from a higher tab generation, even though navigation during action invalidates the original target and result assumptions.

## Required invariant

After dispatch, the following outcomes are `uncertain` with `verificationStatus: not_checked`:

- timeout;
- provider exception or unavailable result;
- provider success without passed verification;
- returned snapshot from any different tab generation.

Only the exact browser instance, tab, origin, generation, action ID, and passed verification may report `succeeded`. Pre-dispatch deterministic denials remain `blocked`.

An uncertain result requires fresh observation and reconciliation before retry. It does not itself assert that an effect occurred.

## Failure behavior

- action timeout: return typed uncertain result;
- observation timeout: continue to throw because no mutation was dispatched;
- identity mismatch: fail closed as a provider contract violation;
- generation change: retain the returned same-tab snapshot for sanitized reconciliation but do not accept success;
- uncertain snapshots are not promoted into the fresh-action registry; a separate observation is required;
- unverified success: downgrade to uncertain;
- provider exception after dispatch: gateway returns uncertain.

## Evidence

Tests cover timeout, observation timeout, exact success, unverified success at both guard and gateway, provider exception, higher generation, refusal to promote an uncertain snapshot, wrong identity, and unsupported pre-dispatch action.

## Residual risk

The optional browser companion is not wired into production workflows. A future adapter must map `uncertain` into the workflow reconciliation state and prove no blind retry end to end. The underlying provider still needs real cancellation/idempotency contracts where available.

## Rollback

Revert the browser uncertainty commit or disable the browser companion. Core Windows/UIA execution is unaffected.
