# M0.5 — Live attestation smoke test

**Status:** not started
**Purpose:** prove the v2 evidence path works against the real host *before* M1
begins, so a schema defect is not discovered halfway through live trials.
**Counts toward completion:** no. M0.5 produces no gate promotion.

Everything in contract v2 has so far been exercised only for local evidence
classes (`fake_integration`, `unit`). The host-bound path — a `live` registry,
a TPM/DPAPI-protected host key, and Field id / generation / boot id bindings —
is proven by fixtures but has never met real hardware. M0.5 closes that gap.

## Why a separate live registry

The development registry (`development-fixtures-2026-08-04`) exists so the
adversarial suite has reproducible fixtures. It is marked `purpose:
development`, and the verifier **rejects live evidence attested under it**.
This is enforced in code, not convention — see the negative case
"rejects a development-registry key presented as live".

Do not regenerate or overwrite the development keys. Generate a separate live
registry on the target machine instead.

## Procedure

### 1. Offline root

```bash
EXOSUIT_COMPLETION_KEY_DIR=/path/outside/repo npm run completion:root-key -- --root-key-id completion-root-live-1
```

Store the root private key offline (removable media or a password manager),
**not** on the laptop that signs evidence. Pin the printed fingerprint in
`pinnedRootKeyFingerprints` in `src/completion/policy.ts`. That diff is the
reviewable moment where a substituted root would be visible.

### 2. Live registry on the target machine

```bash
EXOSUIT_COMPLETION_KEY_DIR=/path/outside/repo npm run completion:keys -- \
  --purpose live --registry-id live-<machine>-<date> --root-key-id completion-root-live-1
```

The host key is bound to `machineIdentity()` automatically. Live registries
expire after one year by design.

Protect the host private key at rest: DPAPI (`ConvertTo-SecureString` /
`Protect-CmsMessage`) initially, TPM sealing when available. The key directory
must be outside Git and outside every worktree; the CLI refuses to run if
`EXOSUIT_COMPLETION_KEY_DIR` resolves inside the repository.

### 3. Enrol and verify the key set

Confirm the registry records, for the host key: machine id, Windows edition and
build, registry id, `notBefore`, `notAfter`.

### 4. Read-only host preflight

Hyper-V present and enabled, virtualization extensions available, no personal
credentials entered. Read-only — create nothing yet.

### 5. One disposable Field generation

Create exactly one generation, boot it, and enter **no personal credentials**.

### 6. Record the evidence

```bash
EXOSUIT_COMPLETION_KEY_DIR=/path/outside/repo npm run completion:record -- \
  --test HYP-001 --class hyperv_host_guest \
  --field-id <id> --field-generation <n> --field-boot-id <boot> \
  --issuer <operator> --run-id <run> \
  --command "<the preflight and lifecycle command that actually ran>"
```

The record binds: exact source commit, host identity, Windows edition and
build, Field id, generation, guest boot id, artifact SHA-256 and byte length,
test-definition version, timestamp, and a nonce. It is signed by the host key.

### 7. Separate reviewer signs the transition

```bash
EXOSUIT_COMPLETION_KEY_DIR=/path/outside/repo npm run completion:transition -- \
  --test HYP-001 --from ready_for_live --to passed --evidence <id> \
  --issuer <operator> --reviewer <different-principal> \
  --reviewer-role technical_review --reason "M0.5 live attestation"
```

Issuer and reviewer must be different principals. Note the three approval
authorities are distinct and never interchangeable:

| Authority | Meaning | Gates |
| --- | --- | --- |
| `technical_review` | An engineer verified the evidence | default |
| `owner_acceptance` | The owner personally accepted the result | TCH, RCP, CPK, OWN, PERF |
| `release_approval` | Release sign-off | INS, COMP, REL, PRD |

### 8. Verify twice

```bash
npm run validate:completion
```

Run once in a fresh process, then **again after a full reboot**. Both must
report zero integrity failures.

## Required negative cases

Every one of these must be rejected. They are automated as fixtures in
`tests/security/liveAttestation.adversarial.test.ts` and must also be exercised
against the genuine host-bound evidence during M0.5.

| # | Attack | Expected rejection |
| --- | --- | --- |
| 1 | Modified artifact bytes | artifact hash mismatch |
| 2 | Missing artifact | not present in the evidence store |
| 3 | Reused nonce | nonce replayed from evidence |
| 4 | Reused evidence id | duplicate evidence id |
| 5 | Wrong machine | host-bound key belongs to a different machine |
| 6 | Evidence copied to another machine | signature does not verify |
| 7 | Wrong Windows build | signature does not verify |
| 8 | Wrong source commit | is not the baseline commit |
| 9 | Wrong Field generation | signature does not verify |
| 10 | Wrong guest boot id | signature does not verify |
| 11 | Missing Field bindings | must name fieldId, fieldGeneration, fieldBootId |
| 12 | Future-dated evidence | evidence is dated in the future |
| 13 | Expired evidence | outside the 90-day freshness window |
| 14 | Revoked host key | key is revoked (root-signed revocation) |
| 15 | Development registry presented as live | purpose development cannot attest live |
| 16 | Issuer also acting as reviewer | reviewer and issuer must differ |
| 17 | Registry edited without root signature | envelope signature does not verify |
| 18 | Replay after restart / rewritten tail | breaks contiguity or chain broken |
| 19 | Unpinned root key | registry root key is not pinned |
| 20 | Wrong approval authority on an owner gate | gate requires owner_acceptance |

**If any of these succeeds, repair contract v2 before starting M1.**

## Exit criteria and freeze

When M0.5 passes:

1. Freeze the evidence envelope and transition-ledger core as **contract v2.1**.
2. Regenerate and re-attest M0 under the live registry.
3. Mark PR #27 ready for formal review.
4. Merge PR #27 into `codex/unify-glove-field` only after explicit approval.
5. Begin M1 with the frozen verifier.

## Current official status

```
Proven personal-MVP completion:       18.31%
Implementation readiness:             59.30%
Live-system completion:                0.00%
Next authorized activity:              M0.5 live-attestation smoke test
Next completion phase after that:      M1
```
