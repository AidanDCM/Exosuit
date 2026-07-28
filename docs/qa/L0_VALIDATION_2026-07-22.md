# L0 Validation - 2026-07-22

## Verdict

The complete L0 validator passed all blocking gates after Hyper-V was enabled, the machine restarted, and the host validator was updated to use non-admin read-only Hyper-V signals. Production readiness remains denied because L0 does not claim owner approval, live VM lifecycle, Teach hooks, visual capture, learning, ChatGPT Field operation, Pilot execution, or emergency-stop behavior.

## Candidate evidence

- clean commit: `6f149cf721761f1cc3bc0d8329f1bf39638907f9`
- command: `scripts/windows/Invoke-ExosuitFieldValidation.ps1`
- evidence: `artifacts/field-validation/20260723T010443Z/`
- passed: `npm ci`, repository contract, master-plan contract, Field contract, TypeScript typecheck, 107 Field tests, Field pulse, 233 full TypeScript tests, TypeScript build, Glove pulse, .NET restore, warnings-as-errors .NET build, 41 .NET tests, and host capability check
- host findings: Windows 11 Pro, Hyper-V feature enabled, Hyper-V cmdlets available, Hyper-V host namespace available, hypervisor present, firmware virtualization usable, SLAT usable, enough memory, and enough free disk
- non-blocking finding: production-readiness report remained denied in report-only mode, as expected for L0
- dependency finding: two moderate transitive npm advisories; no non-breaking automatic remediation was available

The final exact-head rerun is stored as an uncommitted validation artifact after this report is committed. The artifact `environment.json` binds that run to the delivered Git commit and records an empty working tree.

## Claim boundary

This proves repository, plan, TypeScript, .NET pure logic, PowerShell parse/runtime entrypoints, and host capability checks on this machine. It does not prove interactive Hyper-V lifecycle, Teach hooks, visual capture, learning, ChatGPT Field operation, Pilot execution, or emergency stop behavior. Do not start L1 or make a production claim until the remaining release gates have exact evidence and owner approval.
