# Guest startup manifest hashing

- **Goal:** make LocalSystem guest startup verify the bootstrap manifest without depending on PowerShell module autoload.
- **Master-plan phase and promotion gate:** M2 supporting authenticated guest readiness; no promotion is claimed.
- **Subsystem ownership:** Field guest startup only; Glove authority is unchanged.
- **Files changed:** `Start-ExosuitFieldGuest.ps1`, its Windows script tests, and this log.
- **Identity/generation and policy impact:** the same manifest bytes remain SHA-256 bound to the bootstrap call. Field identity, generation, policy, and runtime authority are unchanged. A fresh immutable base/generation is required for live proof.
- **Parts & Pieces and donor patterns:** retains exact-byte digest reconciliation while reducing startup dependencies; no donor code was imported.
- **Questions and assumptions:** the isolated Windows PowerShell harness repeatedly lost `Get-FileHash` under a mixed host module environment even though direct shells exposed it. LocalSystem startup should not rely on ambient module discovery for a security-critical digest.
- **Implementation:** open the exact manifest read-only, compute SHA-256 through the platform cryptography API, normalize lowercase hexadecimal output, and dispose both stream and algorithm in `finally` blocks.
- **Tests added or updated:** static assertions pin the module-independent digest routine and the existing full startup transaction harness exercises it.
- **Commands actually run:** focused Windows Field script tests, repository validator, TypeScript typecheck, and diff validation.
- **Results and evidence class:** startup and script tests passed 14/14, including all protected-secret startup transaction scenarios; repository validation and typecheck passed; diff validation passed. No live capability is claimed.
- **Security and privacy impact:** preserves the same digest and fail-closed bootstrap binding. It adds no logging, secret access, recording, execution, policy, or administrative surface.
- **Rollback or disable path:** revert this slice and rebuild/increment the immutable Field generation.
- **Next recommended slice:** rerun focused Windows script tests and clean-checkout parity, then derive the fresh base containing both display-boundary fixes and this startup hardening.
