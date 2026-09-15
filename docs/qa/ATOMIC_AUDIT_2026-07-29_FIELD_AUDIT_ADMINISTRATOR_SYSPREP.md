# Atomic audit: Field Audit administrator Sysprep

## Question

Does the repair move unsupported SYSTEM Sysprep to the supported Audit administrator without broadening maintenance authority or weakening evidence?

## Verdict

Source design: **pass**. Live Windows acceptance: **not yet passed**.

## Findings

- v16 and v17 both failed after successful SYSTEM maintenance and successful specialize, before OOBE completion.
- v17 added `0x8007001f` evidence and remained offline `IMAGE_STATE_UNDEPLOYABLE`.
- Microsoft states Sysprep under LocalSystem is unsupported on Windows 11 24H2/25H2 and can skip shell/XAML package registration.
- SYSTEM now stops after exact cleanup/install, authority consumption, and its signed-shape receipt.
- The existing built-in Audit administrator waits for and validates that receipt, verifies the one-use service exited, re-verifies its `-500` identity, binds a second receipt to the SYSTEM receipt SHA-256, and launches only the fixed Sysprep command.
- Missing, stale, duplicated, incomplete, or residue-bearing state fails closed.
- PowerShell parsing, 8 focused Windows script tests, repository/plan/Field validators, typecheck, 314 TypeScript tests, production build, both pulses, and 48 Release .NET tests with warnings-as-errors passed.

## Evidence limits

This audit does not claim v18 exists or OOBE passes. Static tests cannot prove Windows principal behavior. Promotion requires exact-head gates, a fresh immutable base, offline receipt verification, and a fresh disposable readiness proof.
