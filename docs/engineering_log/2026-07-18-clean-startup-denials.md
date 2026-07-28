# Clean startup denial exits

## Goal

Make unsafe or incomplete startup configurations fail closed with a deterministic nonzero exit instead of entering Windows unhandled-exception crash handling.

## Files changed

- `apps/windows-agent/Program.cs`
- `docs/qa/CODEX_WINDOWS_ACCEPTANCE.md`
- `docs/qa/ATOMIC_AUDIT_BASELINE.md`
- `docs/qa/evidence/2026-07-18-phase6-startup-denials.json`
- this engineering log

## Parts & Pieces and donor patterns considered

The slice follows Exosuit's deny-by-default startup configuration, local permission ownership, explicit evidence classification, and loop-sentinel discipline. No donor code was copied and no permission was expanded.

## Tests added or updated

No new unit was required for the existing configuration resolver matrix. Local process-level acceptance covered all seven Phase 6 denial configurations plus the control-panel `full_control` rejection.

## Commands actually run

- `pnpm run typecheck`
- `pnpm test`
- `pnpm run build`
- `pnpm run test:pulse`
- `dotnet test apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --configuration Release`
- seven direct isolated agent startup invocations with incomplete configurations
- loopback control-panel POST attempting `full_control`

## Results

- Every unsafe startup case returned exit code `1` with its expected sanitized denial reason.
- The control panel returned HTTP `400`; mode remained `Sandbox`.
- No physical input executed and screenshots remained disabled.
- Typecheck/build, 34 TypeScript tests, system pulse, and 27 .NET tests passed.
- NuGet emitted `NU1900` because vulnerability metadata was unreachable; no clean audit is claimed.

Two earlier harness attempts are not counted as evidence: one failed to propagate child environment values, and one observed the correct exception but timed out in Windows crash handling. Both were terminated and replaced by the direct post-fix matrix.

## Assumptions and unvalidated areas

This proves incomplete configurations fail closed. It does not prove valid physical-input startup, motor behavior, emergency-stop latency, DPI/multi-monitor behavior, or production readiness.

## Security impact

Expected configuration failures now return a deterministic error without a crash dialog or stack trace. All validation remains local and fail closed. No model or MCP path can enable `full_control`.

## Rollback or disable path

Revert the guarded `Program.Main` entry point to the previous direct task return. Operational disable paths remain agent termination, emergency stop, provider disablement, and token rotation.

## Next recommended slice

Exercise non-mutating physical-input policy denials and emergency-stop lock behavior before considering any valid motor run.