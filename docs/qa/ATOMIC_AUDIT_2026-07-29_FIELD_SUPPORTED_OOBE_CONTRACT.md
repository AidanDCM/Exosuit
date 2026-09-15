# Atomic audit: Field supported OOBE contract

## Question

Does the repair remove the live-proven unsupported Windows setup path without adding credentials, privilege, networking, or a setup-state bypass?

## Verdict

Source contract: **pass**. Live Windows acceptance: **not yet passed**.

## Findings

- A fresh v16 disposable generation reached specialize successfully but failed during OOBE with `0x80004005` and offline `IMAGE_STATE_UNDEPLOYABLE`.
- The standard `ExosuitDev` account, secure auto-logon configuration, consumed password seed, and canonical LocalSystem runtime service prove the fixed specialize initializer completed.
- The generated answer file used `SkipMachineOOBE` and `SkipUserOOBE`. Microsoft explicitly warns against `SkipMachineOOBE` for OOBE automation.
- The repair removes both skip flags and adds the supported `HideOEMRegistrationScreen` setting.
- A fail-closed source guard and regression test prevent either skip flag from returning to the generated template.
- The answer file remains credential-free. Development access remains isolated, disposable, standard-user, non-production, and production-validator rejected.
- Repository, plan, and Field validators passed; typecheck, 314 TypeScript tests, production build, system pulse, Field pulse, and 48 Release .NET tests with warnings-as-errors passed.

## Evidence limits

The failed v16 child is terminal negative evidence, not a repair target. Source and fake-provider tests cannot prove Windows OOBE completion. Approval requires a newly built immutable base and a fresh disposable Field with authenticated readiness evidence.

## Required follow-up

Run the complete repository gate, exact-head L0, fresh v17 base build, and fresh Field readiness matrix. Do not claim OOBE or MVP readiness before that evidence exists.
