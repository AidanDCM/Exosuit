# Field per-generation guest seeding

## Goal

Inject exact guest bootstrap/runtime configuration and per-generation channel key material into only the writable OS overlay before VM creation, without placing secrets in the immutable base image.

## Files changed

- `scripts/windows/Invoke-ExosuitFieldProvisioning.ps1`
- `tests/windowsFieldScripts.test.ts`
- `docs/engineering_log/2026-07-23-field-generation-seeding.md`

## Parts & Pieces and donor patterns considered

- Existing exact-plan identity and immutable-parent checks in the provisioner.
- Existing fixed `C:\Exosuit` guest path contract.
- Hyper-V offline VHD mounting used during the reviewed base-image build.
- Well-known Windows SYSTEM and Administrators SIDs for guest-portable NTFS ACLs.

## Tests added or updated

The Windows script contract test now requires:

- an exact four-file seed bundle;
- manifest-to-plan identity validation;
- runtime/manifest agent and key-ID binding;
- a recorded `seed_guest_overlay` completion step;
- SYSTEM-only and Administrators-only ACL application.

## Commands actually run

- Parsed `Invoke-ExosuitFieldProvisioning.ps1` with the PowerShell language parser.
- Ran `npm test -- --run tests/windowsFieldScripts.test.ts`.

## Results

- PowerShell parsing passed.
- The focused Windows administration suite passed 6/6.
- The provisioner mounts only the newly created disposable overlay, validates and copies exactly `bootstrap-manifest.json`, `guest-runtime.json`, `guest-launch.json`, and `channel-secret.txt`, restricts their directory ACL, and detaches the overlay before VM creation.

## Assumptions and unvalidated areas

- Live NTFS ACL behavior and guest SYSTEM access remain to be proven.
- The seed directory is machine-local and must never be committed or included in evidence.
- The channel secret is generation-specific; key rotation and revocation remain a later L2 failure-injection slice.

## Security impact

The immutable base contains no channel or attestation secret. Seed identity must match the signed provisioning plan and bootstrap manifest. Fixed guest paths and an exact file allowlist block arbitrary host file injection. The overlay remains disposable and provisioning rollback removes it on failure.

## Rollback or disable path

Omit `-GuestSeedDirectory` to retain the prior unseeded L1 behavior, or revert this commit. Destroy the disposable generation and securely revoke/remove its machine-local seed directory and replay state.

## Next recommended slice

Run complete L0 on the clean commit, register base v2 and its digest, generate a canonical policy/attestation/manifest and per-generation secrets, execute dry-run and live apply with guest seeding, complete Windows setup, then verify signed KVP readiness before destruction.
