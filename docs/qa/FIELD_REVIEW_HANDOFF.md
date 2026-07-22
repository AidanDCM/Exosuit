# Field Reviewer Handoff

Reviewers should start with:

1. `docs/GLOVE_FIELD_BOUNDARY.md`
2. `docs/FIELD_IMPLEMENTATION_STATUS.md`
3. `docs/qa/ATOMIC_AUDIT_2026-07-21_FIELD_SOURCE_EXHAUSTION.md`
4. `docs/qa/FIELD_THREAT_MODEL.md`
5. `docs/qa/FIELD_FAILURE_INJECTION_MATRIX.md`
6. `docs/FIELD_WINDOWS_RUNBOOK.md`

## Highest-risk review targets

- `src/fieldChannel.ts` and `.NET FieldChannelFoundation.cs`
- `src/fieldCommand.ts`
- `src/fieldProvisioningPlan.ts`
- `scripts/windows/Invoke-ExosuitFieldProvisioning.ps1`
- `scripts/windows/Remove-ExosuitFieldGeneration.ps1`
- `src/teachRecorder.ts`
- `src/encryptedDemonstrationStore.ts`
- `src/visualRetention.ts`
- `src/fieldPathScope.ts`
- `src/fieldArtifactBroker.ts`
- `src/fieldRecovery.ts`
- `tests/fieldSystemPulse.test.ts`

## Review questions

- Can model-controlled data reach a shell, path, VM setting, key, consent, deletion, or sensitive export decision?
- Can a stale generation, boot, scene, policy, message, or approval be reused?
- Can the base or personal-state disk be modified/deleted accidentally?
- Can Teach/Shadow inject input?
- Can screenshots, UI values, credentials, or operator identity enter logs/support bundles?
- Can an uncertain effect retry?
- Can emergency stop fail into automated recovery?
- Do tests actually prove the stated source property?
- Which statements still require Windows/Hyper-V evidence?

## Merge recommendation

Remain draft until L0 executable validation passes. Do not approve live capabilities based solely on source volume or fake tests.
