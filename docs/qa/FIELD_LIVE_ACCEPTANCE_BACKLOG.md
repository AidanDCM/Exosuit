# Exosuit Field Live Acceptance Backlog

This file is the source-of-truth ordering for work that cannot be proven through repository-only development.

## Dependency order

```text
L0 executable source validation
  -> L1 Hyper-V synthetic generation
    -> L2 authenticated guest channel and heartbeat
      -> L3 bootstrap, display, lock, and destruction acceptance
        -> L4 live scene producer
          -> L5 Teach hooks and privacy acceptance
            -> L6 live artifact broker
              -> L7 Shadow predictor and no-input proof
                -> L8 one synthetic Pilot workflow and physical emergency stop
```

No later level may be promoted while an earlier required level is failing.

## L0 — Executable source validation

Run `Invoke-ExosuitFieldValidation.ps1` on the exact PR head. Preserve all logs and summary. Repair confirmed failures and repeat from the beginning.

Done when:

- repository and Field validators pass;
- TypeScript typecheck, focused tests, fake pulse, full tests, build, and Glove pulse pass;
- PowerShell scripts parse;
- .NET restore/build warnings-as-errors/tests pass;
- host capability result is recorded;
- PR and audit cite exact commit and evidence paths.

## L1 — Hyper-V synthetic generation

Use synthetic images/accounts only. Dry-run and apply one isolated generation. Verify immutable parent, child overlay, separate task disk, private switch, integration settings, evidence, bounded rollback, and destruction confinement.

Done when all relevant H rows in the failure matrix pass.

## L2 — Authenticated channel and heartbeat

Choose and implement the supported local transport. Add durable sequence/replay state, protected key storage, key rotation, startup handshake, guest emitter, host monitor, shutdown, and emergency-stop messages.

Done when mutation/replay/restart/key-rotation/heartbeat-crash tests pass.

## L3 — Bootstrap and lifecycle

Wire bootstrap manifest/report, exact display enforcement, Secure Desktop/session-lock checks, Field Manager readiness, boot/generation transitions, and stop/destroy paths.

Done when no Field reaches ready before every check passes and stale guest processes cannot rejoin.

## L4 — Live scene producer

Produce windows/elements/focus/modal/cursor/system state from the guest. Prove increasing versions, event loss recovery, fresh action target resolution, wrong-focus denial, and lock/Secure Desktop behavior.

## L5 — Teach and privacy

Add owner-visible consent and recording state, independent stop, bounded input/UIA/system hooks, optional visual sensor/blob store, redaction, retention, deletion, and credential-field exclusions.

Done when recording cannot run invisibly and no input injection path exists.

## L6 — Live artifact broker

Implement reparse-aware copy, staging, final-destination verification, classification, quarantine, owner-reviewed sensitive export, cancellation, and uncertain-copy reconciliation.

## L7 — Shadow

Add demonstration retrieval and actual prediction. Preserve `executionAllowed:false`, compare actual actions, publish owner-readable reports, and prove process-level no-input behavior.

## L8 — Synthetic Pilot

Wire one approved synthetic application/workflow. Enforce exact guest command authorization, verification, budgets, reconciliation, audit, physical emergency stop, and disposable reset. Do not generalize until the one workflow passes all failure injections.
