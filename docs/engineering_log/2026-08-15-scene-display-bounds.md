# Scene display-bounds validation

- **Goal:** prevent an authenticated structural scene from being accepted under a contradictory display coordinate space.
- **Master-plan phase and gate:** M2 / SCN-001; no promotion is claimed.
- **Subsystem ownership:** Field host scene receiver; Glove authority is unchanged.
- **Files changed:** `src/fieldSceneObservation.ts`, focused adapter/receiver tests, Field architecture/status/test documentation, failure-injection matrix, and atomic audit.
- **Identity/generation and policy impact:** exact Field/generation/boot/agent/session/key/replay binding is unchanged. The fix must ship in a new immutable base/generation for live validation. The pilot cannot create or expand policy.
- **Parts & Pieces and donor patterns:** retained strict reconciliation and fail-closed scene adaptation; no donor code was imported.
- **Questions and assumptions:** Generation 20 approved 1920×1080 but its verified UI Automation payload reached 2048×1152. The source of that coordinate disagreement is not yet assumed; silent scaling or clipping would hide the failure.
- **Tests added:** active-window and element overflow rejection plus receiver proof that display denial does not consume replay state.
- **Commands actually run:** focused `fieldSceneObservation`/`fieldSceneChannel` tests; TypeScript typecheck; direct adaptation of the captured Generation 20 envelope payload; repository, master-plan, and Field-contract validators; Field suite; Field pulse; full TypeScript suite; build; Glove pulse; and attempted .NET restore/build/test.
- **Results and evidence class:** Generation 20 supplies live transport/authentication evidence and negative display evidence. The captured payload was rejected with `Field scene window bounds exceed the approved display contract.` Focused scene tests passed 9/9; repository, plan, and Field validators passed; typecheck and build passed; Field and Glove pulses passed. The Field and full TypeScript suites each passed every scene test but retained one unrelated Windows startup-harness failure because its isolated child PowerShell could not resolve `Get-FileHash` (264/265 Field and 876/877 full). The installed `dotnet` host reported that no SDK is available, so .NET restore/build/test could not execute in this shell. These limitations are not reported as passes.
- **Security and privacy impact:** strengthens display integrity without changing screenshots, UI-text retention, recording, credentials, audit, emergency stop, or execution authority.
- **Rollback or disable path:** revert this slice or disable the opt-in guest scene session; do not reuse Generation 20 as positive display evidence.
- **Next recommended slice:** validate the source, reconcile the guest's actual interactive display with the approved contract, then build a fresh immutable base and repeat one authenticated scene before broader SCN-001 ceremonies.
