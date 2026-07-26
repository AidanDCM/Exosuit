# Level 4 audit — Field maintenance SYSTEM principal

**Date:** 2026-07-26
**Depth:** Level 4 — guest identity, local execution, and base-image integrity

## Boundary

The host may authorize a fixed one-use maintenance operation only inside a network-detached staging VM cloned from immutable v10. The Audit Mode bootstrap may dispatch only the reviewed maintenance script as local SYSTEM. Neither model output nor guest content can create this authority.

## Live evidence entering this slice

- Windows processed the reviewed `oobeSystem` and `auditUser` passes.
- The fixed bootstrap ran for its bounded five-minute window.
- The one-use task existed, but its exported principal serialized as `InteractiveToken` instead of the requested service-account logon.
- No receipt was produced; authorization and answer file remained unconsumed.
- The host stopped after twenty-five minutes and did not create the immutable v12 target.
- Task Scheduler operational logging was disabled, and the old timeout record overwrote its last state.

## Controls

- exact `S-1-5-18` and `ServiceAccount` are encoded in reviewed Task Scheduler XML;
- the registered principal and fixed action are checked before the task starts;
- execution remains passwordless only for built-in local SYSTEM;
- the maintenance script independently verifies SYSTEM identity, both authorized digests, expiration, detached networking, account scope, component presence, and the one-use task;
- bootstrap status preserves task state, principal, last run, numeric result, and sanitized error;
- maintenance status records only fixed stage names and canonical timestamps;
- receipt, authorization consumption, answer-file consumption, task removal, Sysprep shutdown, offline receipt validation, and digest-equal read-only promotion remain mandatory;
- unknown or mismatched state fails closed without v12 promotion.

## Validation

PowerShell parsing passed. Six focused Field administration tests, 240 full TypeScript tests, typecheck, production build, 44 .NET tests, the system pulse, and the Field full-chain pulse passed. The complete exact-head L0 validator and live v12 rebuild remain required after commit.

## Residual risk

Static and fake-provider tests cannot prove Windows Audit Mode preserves the service-account principal or that Sysprep completes. The next isolated build must capture the exported task/status, offline receipt, account/profile absence, consumed authorization, target digest, and read-only target state. Until then v12 remains unapproved and absent.

## Verdict

Source change is acceptable for another isolated live attempt. Production and base-image promotion remain denied until exact-head L0 passes and the live receipt/promotion contract succeeds.
