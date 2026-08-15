# Guest scene display-bounds validation

- **Goal:** prevent a post-bootstrap interactive-desktop resize from reaching the privileged scene signer.
- **Master-plan phase and gate:** M2 / SCN-001; no promotion is claimed.
- **Subsystem ownership:** Field guest observe-only producer boundary; Glove authority is unchanged.
- **Files changed:** compiled producer boundary and focused tests, Field status/test documentation, failure-injection matrix, atomic audit, and this log.
- **Identity/generation and policy impact:** exact Field/generation/boot/session/SID/path/digest binding remains mandatory. A fresh immutable base and generation are required for live proof. The pilot cannot create or expand policy.
- **Parts & Pieces and donor patterns:** applies the same strict coordinate reconciliation at two independent trust boundaries; no donor code was imported.
- **Questions and assumptions:** host inspection showed the VM video device fixed at 1920×1080 while the enabled enhanced-session transport can resize the interactive desktop after bootstrap. The fix does not assume DPI or transport details; any contradictory coordinate space fails closed.
- **Tests added:** compiled rejection of 2048×1152 window bounds and an element extending beyond 1920×1080.
- **Commands actually run:** .NET restore; Release build with warnings as errors; focused compiled producer-boundary tests; full .NET suite; repository, master-plan, and Field-contract validators; TypeScript typecheck; focused TypeScript scene tests; and diff validation.
- **Results and evidence class:** restore succeeded; Release build passed with zero warnings/errors; compiled producer-boundary tests passed 4/4; full .NET tests passed 293/293 on immediate rerun; all three validators and typecheck passed; focused TypeScript scene tests passed 9/9; diff validation passed. The first full .NET run had one unrelated timing assertion failure in `BootstrapAndVerificationResultsBindExactBootAndEvidenceMetadata`; the unchanged test passed in the immediate full-suite rerun. Generation 20 remains live diagnostic evidence only.
- **Security and privacy impact:** strengthens display integrity before signing without adding screenshots, UI text, recording, input, credentials, policy, export, or administration authority.
- **Rollback or disable path:** revert this slice or disable the opt-in scene session. Never promote a mismatched scene by clipping or scaling it.
- **Next recommended slice:** build a fresh immutable base, use a stable basic VM connection at the approved resolution, then repeat authenticated scene production and host receipt.
