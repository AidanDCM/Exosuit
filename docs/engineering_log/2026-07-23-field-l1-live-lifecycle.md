# Field L1 live lifecycle proof

## Goal

Execute and capture one bounded Hyper-V Field create/start/inspect/stop/destroy lifecycle on an exact clean L0-validated commit while preserving the immutable base image.

## Files changed

- `docs/engineering_log/2026-07-23-field-l1-live-lifecycle.md`

All machine-local plans, host configuration, VM artifacts, and evidence remain ignored or outside the repository.

## Parts & Pieces and donor patterns considered

- `docs/FIELD_WINDOWS_RUNBOOK.md` for the hard holds, exact confirmation phrases, and claim boundary.
- `scripts/windows/Invoke-ExosuitFieldValidation.ps1` for clean-commit L0 evidence.
- `scripts/windows/Invoke-ExosuitFieldProvisioning.ps1` for guarded creation and rollback.
- `scripts/windows/Remove-ExosuitFieldGeneration.ps1` for scoped destruction.
- Hyper-V configuration inspection cmdlets for independent live-state evidence.

## Tests added or updated

No additional test changed in this evidence-only slice. The immediately preceding disposable-plan fix added a focused regression and passed the complete validator.

## Commands actually run

- Committed the disposable-plan fix as `bb3df81f0424614c1ca4d38b14ab0d7967c4c622`.
- Ran `scripts/windows/Invoke-ExosuitFieldValidation.ps1` with the user-local .NET 8 SDK on that exact clean commit.
- Generated and dry-ran an isolated no-personal-state plan.
- Ran a typed-confirmation live apply with 8192 MiB startup memory; Hyper-V rejected the start for insufficient RAM and the script rolled back the VM and generation directory.
- Generated and dry-ran a replacement plan with 4096 MiB startup, 2048 MiB minimum, and 4096 MiB maximum dynamic memory.
- Ran typed-confirmation live apply with `-Confirm:$false` to suppress the redundant hidden `ShouldProcess` prompt.
- Independently inspected VM state, generation, memory, processors, Secure Boot, vTPM, switch attachment, and both disk attachments.
- Ran the exact typed-confirmation destroy script with `-Confirm:$false`.
- Independently verified VM absence, generation-root absence, and the immutable base image's read-only state and SHA-256.

## Results

- L0 evidence: `artifacts/field-validation/20260723T144626Z`.
- Every blocking L0 gate passed. The production-readiness report remained non-blocking and denied as expected.
- The 8192 MiB start failed safely and recorded `failed_rolled_back`; the VM and disposable generation root were removed.
- The 4096 MiB Field started and reported `Operating normally`.
- Independent inspection proved:
  - Hyper-V generation 2;
  - 4096 MiB startup with dynamic memory;
  - four virtual processors;
  - Secure Boot on with the Microsoft Windows template;
  - vTPM enabled;
  - one adapter attached to `Exosuit-Field-Isolated`;
  - a disposable OS differencing disk and distinct task disk attached on SCSI.
- The provisioning status remained `started_pending_guest_validation`; no readiness claim was made.
- Destroy evidence recorded VM stop, VM removal, and generation-root removal.
- Post-destroy evidence proved the VM and generation root absent.
- The immutable base remained present, read-only, and unchanged at SHA-256 `b93a20f121105e5edcfabdb589dfd23e14ceacdf4fb4f84738738a78b07e9d7d`.

## Assumptions and unvalidated areas

- This proves the host-side L1 lifecycle only.
- Windows boot progress inside the guest, OOBE, guest bootstrap, authenticated channel, heartbeat, identity, display contract, policy, and attestation remain unvalidated.
- The evaluation image is not a production licensing basis.
- No guest credentials or secrets were created or embedded.

## Security impact

The live VM used only the Hyper-V Private switch, an immutable parent with a disposable child, a separate disposable task disk, Secure Boot, and vTPM. The first resource failure exercised automatic rollback. Destruction was confined to the exact generation path and VM name. The post-destroy digest proves the parent image was not modified.

## Rollback or disable path

The live VM and generation files are already destroyed. To disable further L1 execution, remove the ignored host registry or the private switch after confirming no VM uses it. Do not remove the base image while differencing children exist.

## Next recommended slice

Create a reviewed base-image generation that includes Exosuit guest components, complete Windows guest setup without embedding secrets, then prove guest bootstrap, authenticated loopback channel, heartbeat, identity, display contract, policy, and attestation before declaring a Field ready.
