# Engineering Log - Host Validator Non-Admin Hypervisor Detection

**Date:** 2026-07-22
**Master-plan phase:** L0
**Subsystem ownership:** Field validation
**Starting commit:** `fdafacebc2a4c701a163608b339dbbcd795ed746`

## Goal

Keep the L0 host-capability gate deny-by-default while removing a false negative observed after Hyper-V was enabled and the machine restarted from a non-admin Codex shell.

## Files changed

- `scripts/windows/Test-ExosuitFieldHost.ps1`
- `tests/windowsFieldScripts.test.ts`
- `docs/engineering_log/2026-07-22-host-validator-non-admin-hypervisor.md`

## Parts & Pieces and donor patterns considered

Reused the validator's existing read-only PowerShell/CIM probing style and fail-closed boolean check map. No donor code was copied. The detection now accepts the same host state through non-mutating fallbacks when DISM requires elevation or when Windows hides CPU requirement fields because a hypervisor is already active.

## Tests added or updated

Updated the Windows script contract test to require the fallback probes: `Win32_OptionalFeature`, `Get-ComputerInfo.HyperVisorPresent`, and the Hyper-V WMI namespace.

## Commands actually run

- `Get-CimInstance Win32_OptionalFeature -Filter "Name='Microsoft-Hyper-V-All'"`
- `Get-ComputerInfo -Property HyperV*`
- `Get-CimInstance -Namespace root\virtualization\v2 -ClassName Msvm_ComputerSystem`
- `scripts/windows/Test-ExosuitFieldHost.ps1`

## Results

Before this change, the host validator failed even though Windows reported Hyper-V installed, the hypervisor present, `vmms` running, and `Get-VM` available. The failure came from non-admin DISM access and processor requirement fields being unavailable after the hypervisor starts.

## Assumptions and unvalidated areas

An active Windows hypervisor plus the Hyper-V WMI namespace is treated as evidence that firmware virtualization and SLAT are usable for L0 host readiness. This does not prove VM lifecycle, guest boot, Windows UI Automation, screenshots, input injection, or emergency stop behavior; those remain later live gates.

## Security impact

No host mutation, privilege escalation, network binding, model authority, logging expansion, or policy relaxation is introduced. Unknown or missing signals still fail closed.

## Rollback or disable path

Revert this slice if the fallback probes are too permissive for the final acceptance matrix. A reverted validator will continue to require admin-readable DISM and processor fields.

## Next recommended slice

Rerun the complete L0 validator on the exact clean commit and update the QA report with the final evidence directory.
