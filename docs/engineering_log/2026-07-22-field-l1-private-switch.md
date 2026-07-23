# Field L1 private-switch preparation

## Goal

Create and verify the dedicated Hyper-V Private switch required by the Field L1 provisioning contract without creating a VM or attaching any disk.

## Files changed

- `docs/engineering_log/2026-07-22-field-l1-private-switch.md`

Runtime evidence was written beneath the ignored `artifacts/field-l1-host-prep/` directory.

## Parts & Pieces and donor patterns considered

- `docs/FIELD_WINDOWS_RUNBOOK.md` for the required isolated-switch boundary.
- `vm/field-host-config.example.json` for the canonical switch name.
- The existing host-capability evidence pattern for machine-local JSON evidence.

## Tests added or updated

No product test changed. This slice changes only local Hyper-V host configuration and records the result.

## Commands actually run

- Confirmed the worktree was clean at commit `39ddca4c35730b6eadd59f7efd23a3c2d348c43e`.
- Searched `C:\ProgramData\Exosuit`, Downloads, and Desktop for local `.vhd`, `.vhdx`, and `.iso` assets while excluding repository dependency and Git directories.
- Ran an elevated, idempotent PowerShell command that:
  - looked up `Exosuit-Field-Isolated`;
  - created it with `New-VMSwitch -SwitchType Private` when absent;
  - rejected an existing switch with any other switch type;
  - wrote the resolved name, type, identifier, creation status, and UTC timestamp to JSON evidence.

## Results

- The switch was created successfully.
- Resolved name: `Exosuit-Field-Isolated`.
- Resolved type: `Private`.
- No VM was created.
- No Windows VHD, VHDX, or Windows installation ISO was found in the searched local locations. The only discovered ISO was an Ubuntu desktop image and is not eligible for the Windows Field base-image contract.

## Assumptions and unvalidated areas

- The Hyper-V switch is host-local and requires administrator access to inspect or change.
- Guest boot, guest integration, secure boot, disk layout, and lifecycle behavior remain unvalidated.
- The immutable Windows base image is still absent, so live provisioning remains blocked.

## Security impact

The new switch is Private, so it permits VM-to-VM communication on the same host but does not provide host or external-network connectivity. The provisioning scripts must continue to reject any switch whose resolved type is not Private. No model permission, agent binding, credential path, capture path, or execution capability changed.

## Rollback or disable path

After confirming that no VM is attached to the switch, an administrator can remove only this switch with:

```powershell
Remove-VMSwitch -Name 'Exosuit-Field-Isolated'
```

Do not remove unrelated Hyper-V switches.

## Next recommended slice

Obtain and owner-approve a Windows base VHDX containing the reviewed guest integration and Exosuit components, place it at the configured immutable path, record its exact SHA-256 digest in a local host registry and provisioning plan, then rerun plan resolution and dry-run apply before any live `-Apply`.
