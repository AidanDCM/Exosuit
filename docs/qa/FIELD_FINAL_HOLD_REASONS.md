# Field Final Hold Reasons

1. GitHub-hosted jobs do not allocate runners or execute steps.
2. No authenticated local checkout has run Node, TypeScript, .NET, or PowerShell validation on the current head.
3. PowerShell scripts are parsed only by future CI; they are not executed.
4. Hyper-V provider behavior and isolation are unproven.
5. Host/guest channel is a contract, not a live transport.
6. Replay state and key lifecycle are not durable.
7. Guest bootstrap/heartbeat/command modules are not wired into the Windows agent.
8. Teach hooks, visible consent UI, visual capture, and independent stop do not exist.
9. Artifact broker has no live TOCTOU-safe copy implementation.
10. Shadow has no predictor; Pilot has no integrated live workflow.
11. Physical emergency stop is not proven for the Field.
12. Installer, signing, updater, retention operations, penetration testing, and production support are absent.
