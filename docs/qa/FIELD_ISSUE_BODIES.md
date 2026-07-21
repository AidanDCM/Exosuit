# Remaining Field Issue Specifications

These specifications are also intended for GitHub issues. They remain in the repository so the work is not lost if issue metadata changes.

## L0: Execute current-head validation

Goal: run the evidence-preserving validation script on an authenticated Windows checkout, repair exact failures, and attach complete evidence.

Must run:

- repository validator;
- Field validator;
- TypeScript typecheck, focused tests, Field pulse, full tests/build, Glove pulse;
- PowerShell parser;
- .NET restore/build warnings-as-errors/tests;
- host capability check.

Done: all pass on exact commit, or PR remains draft with exact failures documented.

## L1: Synthetic Hyper-V generation

Goal: prove one isolated generation can be dry-run, created, started, stopped, rolled back, destroyed, and recreated while base/personal disks remain intact.

Must inject:

- wrong image hash;
- existing VM/directory;
- wrong switch type;
- VM create/config failure;
- rollback failure fixture;
- reparse-point deletion attempt;
- wrong typed confirmation.

## L2: Live authenticated channel and heartbeat

Goal: integrate a supported local transport, protected key storage, rotation, durable replay state, guest emitter, host monitor, shutdown, and emergency stop.

Must inject mutation, replay, sequence rollback, restart, wrong key, expired message, stale generation, guest reboot, guest crash, and heartbeat pause.

## L3: Guest readiness and lifecycle

Goal: wire bootstrap, display, session lock, Secure Desktop, attestation, Field Manager readiness, stop, generation replacement, and stale-process denial.

## L4/L5: Live scene and Teach privacy

Goal: produce live scene state, add consented visible Teach hooks, encrypted storage, visual blob policy, independent stop, deletion, and credential-field exclusions.

## L6: Live artifact broker

Goal: implement bounded cross-VM copy with reparse traversal checks, staging, final destination hash, TOCTOU mitigation, quarantine, cancellation, and owner-reviewed sensitive export.

## L7: Shadow predictor

Goal: add retrieval and actual next-action prediction while proving no input authority at process level.

## L8: Synthetic Pilot workflow

Goal: run one local fixture workflow with exact policy/scene/action/budget enforcement, verification, no-blind-retry recovery, audit, and physical emergency stop.
