# Developer Handoff — M1 Live Field

**Updated:** 2026-08-07  
**State:** contract v2.3 frozen; M0 re-attested and proven; evidence artifacts portable; M1 not yet passed  
**Canonical integration branch:** `codex/unify-glove-field` at `1ac8488`

> For the deadline program, start with `docs/project-driver/DEVELOPER_HANDOFF.md`. This file is the concise M1-specific reference.

## Current status

```text
Tests                         624 / 624 across 91 files
Proven MVP completion         18.31%
Implementation readiness      59.30%
Live gate completion           0.00%
M0                             passed under frozen v2.3
HYP-001                        not passed
CHN-001                        not passed
Secure Boot                    disabled; current hard blocker
```

Never describe implementation readiness as completion. Only gates folded to `passed` through the signed ledger count as proven.

## What has merged

- PR #28 — M1 documentation, TPM sealing, TPM-only live-key enforcement, recovery ledger, HYP-001 harness, CI concurrency, development-velocity plan
- PR #29 — v2.3 custody binding, versioned records, TPM participation proof, frozen fingerprint update, M0 re-attestation
- PR #30 — six referenced evidence artifacts published, clean-clone reconciliation invariant, Linux line-ending verification, evidence secret scan

The old branches `codex/m1-handoff`, `codex/contract-v23-key-custody`, and `codex/publish-evidence-artifacts` are retired. Do not monitor or develop against them.

## Contract and evidence state

- `FROZEN_CONTRACT_LABEL` is `2.3`.
- v2.3 records structurally require custody fields.
- Live records require TPM backend, a valid custody event, no open recovery grant, a live registry, and TPM participation proof.
- Existing legacy records remain verifiable under the versioned schema and cutoff policy.
- M0 was re-attested against v2.3.
- Completion artifacts referenced by the committed evidence store are now committed.
- Hosted CI verifies existence, filename hash, byte length, absence of committed orphans, and evidence secret scanning without private keys.

Do not repeat the obsolete claim that the v2.3 fingerprint is intentionally stale or that M0 re-attestation is pending.

## Environment facts

| Item | Current fact |
|---|---|
| Host | `AIDANS-DELL7430`, Dell Latitude 7430, Windows 11 Pro build 26200 |
| Machine id | `machine-9c62d678dd970f15` |
| Hyper-V | installed and running; account is in Hyper-V Administrators |
| Live private keys | `C:\Users\Aidan\.exosuit-live-keys`; TPM vaults plus retained DPAPI recovery vaults; no plaintext |
| Field storage | `C:\ProgramData\Exosuit\Fields` |
| Base images | `C:\ProgramData\Exosuit\Images` |
| Current base | `exosuit-field-base-v25.vhdx`, SHA-256 prefix `5ec795fe` |
| Isolated switch | `Exosuit-Field-Isolated` |
| Host RAM | approximately 16 GB; use the HYP-001 dynamic-memory profile |
| Secure Boot | disabled until the operator changes firmware |

The provisional live root remains suitable only for the personal MVP posture. It is not production-eligible and must eventually be replaced by genuinely external/offline authority for production distribution.

## Current blocker: Secure Boot

This requires physical presence and cannot be completed by a remote agent.

1. Ensure the BitLocker recovery key is accessible.
2. Restart into Dell firmware with `shutdown /r /fw /t 0` or F2 during boot.
3. Enable Secure Boot, retain UEFI boot and `Deployed` mode.
4. After Windows starts, run elevated PowerShell:

```powershell
Confirm-SecureBootUEFI
npm run hyp001:preflight
```

`Confirm-SecureBootUEFI` must return `True`. The signed preflight artifact—not a chat statement—must show Secure Boot passing.

## HYP-001

Acceptance:

- elevated preflight passes
- disposable Field completes three lifecycle cycles
- each cycle has a unique boot identity and valid lifecycle window
- immutable base remains unchanged
- cleanup is confined to the exact Field generation
- evidence class is `hyperv_host_guest`
- a non-issuer technical reviewer approves promotion

Commands:

```powershell
npm run hyp001:preflight
npm run hyp001:cycles
npm run hyp001:cycles -- --apply --confirm "RUN HYP-001 LIVE CYCLES"
npm run hyp001:record
```

`cycles` is dry-run by default. `record` remains separate so failed or partial runs do not automatically become signed claims.

## CHN-001

After HYP-001 passes, prove:

- replay rejection
- wrong identity, Field generation, and boot rejection
- lock and Secure Desktop handling
- heartbeat degradation and recovery
- independent emergency stop
- every negative fails for the intended reason
- non-issuer reviewer approves promotion

No project action path is considered live-proven until both HYP-001 and CHN-001 pass.

## Command reference

```bash
npm ci
npm run typecheck
npm test
npm run validate:completion
npm run validate:evidence-artifacts
npm run scan:evidence-artifacts
npm run validate:full
```

Completion CLI examples:

```bash
tsx src/completion/cli.ts record --test <ID> --class <class> --command "<cmd>"
tsx src/completion/cli.ts record-artifact --test <ID> --class <class> --file <path> --field-id <id> --field-generation <n> --field-boot-id <id>
tsx src/completion/cli.ts transition --test <ID> --from ready_for_live --to passed --evidence <ids> --issuer <issuer> --reviewer <reviewer> --reason "<reason>"
```

Recording is a claim. The evaluator is the judgment. A written record may still be rejected.

## Process rules

- Verify exact branch and SHA before reporting state.
- Recompute counts and percentages rather than copying an old handoff.
- Update tooling in the same change as a contract rule.
- A rejection counts only when it occurs for the intended reason.
- Do not infer environment state from old notes.
- Use Restart, not shutdown/power-on, when genuine reboot evidence is required.
- Separate harness defects from contract defects.
- Never let an implementing identity approve its own promotion.
- Evidence must remain reviewable from a clean clone.

## Next order

1. Review `docs/project-driver/DEVELOPER_HANDOFF.md` and issue #31.
2. Complete the exact project-workflow definition.
3. Enable Secure Boot and capture signed preflight.
4. Run, review, and promote HYP-001.
5. Run, review, and promote CHN-001.
6. Begin the project-specific visual observe/act/verify spine.

## References

- `docs/project-driver/DEVELOPER_HANDOFF.md`
- `docs/project-driver/DEADLINE_EXECUTION_PLAN.md`
- `docs/COMPLETION_GATE_V2.md`
- `docs/qa/BUILD_COMPLETION_TEST_MATRIX.md`
- `docs/qa/M0_5_LIVE_ATTESTATION_2026-08-05.md`
- `src/completion/frozen.ts`
- `src/completion/hyp001.ts`
- `src/completion/hyp001Harness.ts`
