# M0.5 — Live Attestation Smoke Test

**Date:** 2026-08-05
**Host:** `AIDANS-DELL7430` — Dell Latitude 7430, Windows 11 Pro build 26200
**Machine id:** `machine-9c62d678dd970f15`
**Source commit:** `94b2610610a2ad43e98caa6c28a4604720c2e504`
**Result:** the live attestation path works end to end. **M0.5 does not count toward
M1 completion** and no gate was promoted.

## Why this ran

Contract v2 and v2.1 were proven against fixtures. A verifier that only works on
synthetic data has not been shown to work at all, so before M1 collects real
evidence the whole path was exercised once against a real host and a real Field.

## What was proven

| Step | Result |
| --- | --- |
| Provisional live root generated offline | yes — script refused a first attempt while online and created nothing |
| Live registry sealed | `live-2026-08-05-aidans-dell7430`, `purpose: live`, 7 keys |
| Host key bound to this machine | `live-host-1` → `machine-9c62d678dd970f15`, matches the CLI's computed identity |
| Private keys DPAPI-protected outside the repo | 8 vault files, **zero plaintext `.pem`** |
| Elevated read-only collector | `elevated: true`, host config identical before and after |
| Collector integrity | pre-elevation hash, in-snapshot hash, and post-run re-measurement all `35130513…490` |
| Disposable Field created | fresh id `5e919359-3927-4fc7-88ff-f6fad1b2c517`, generation 1 |
| Booted with no credentials | heartbeat OK in 31 s; guest reached only over the KVP channel |
| Field attestation recorded | `5ee8a4bae865…`, signed by the host-bound key |
| Live evidence verified | 2 records valid, 0 rejected, **0 integrity failures** |
| Negative cases | **18/18** behaved as expected against the real artifacts |
| Field destroyed | only the M0.5 Field; 23 prior field directories and the G4 VM untouched |
| Immutable base unchanged | v25 hashed before *and* after in the same session — identical |

### Immutable base

```
before: 5ec795fe378d256131e4e1c89c597a79a30e8923cafa3df6b793e7c125a2c744
after : 5ec795fe378d256131e4e1c89c597a79a30e8923cafa3df6b793e7c125a2c744
pinned: 5ec795fe378d256131e4e1c89c597a79a30e8923cafa3df6b793e7c125a2c744
attributes: ReadOnly, Archive, NotContentIndexed
```

### Negative cases (real artifacts, not fixtures)

Modified artifact bytes · missing artifact · reused nonce · reused evidence id ·
wrong machine · wrong Windows build · wrong source commit · wrong Field
generation · wrong guest boot id · future-dated · expired · revoked host key ·
development-registry key presented as live · registry edited without the
offline-root signature · live evidence signed by a non-host key · live evidence
self-designated synthetic · evidence class not accepted by the gate. Plus a
control that must be accepted.

Runner: `src/completion/m05Negatives.ts`.

Two cases initially reported as verifier gaps were **harness artefacts**, not
weaknesses, and were corrected rather than reported:

- *reused evidence id* — after mutation both records share an id, so "did the
  target survive" is ambiguous. The store-level duplicate report is the
  unambiguous signal.
- *registry edited without the root signature* — the registry envelope is
  verified at evaluation level, not by the evidence store, so the case was
  being checked at the wrong layer.

## Findings

**Host Secure Boot is OFF.** `secureBoot: false` — disabled, not unreadable. The
VM has Secure Boot on with the `MicrosoftWindows` template, but that is guest
firmware and says nothing about the host. The boot chain under the root key is
unverified. **M1 entry requirement.**

**TPM 2.0 is present, ready, and owned.** STM, spec `2.0, 0, 1.38`,
`managedAuthLevel: Full`. TPM sealing is available now, so the host key need not
rest on DPAPI alone. **M1 entry requirement.**

**Configuration drift — `Exosuit-Field-NAT` is absent.**

```
expected by configuration: Exosuit-Field-NAT
observed on host:          absent
M0.5 impact:               none (isolated switch present and used)
future NAT-profile impact: blocking
```

Not created; networking was left unchanged.

**Host memory is tight.** The Field could not start at the 4 GB fixed allocation
the existing G4 VM uses — only 3.68 GB of 15.44 GB was free. It ran on dynamic
memory (1 GB min / 2 GB startup / 4 GB max) and settled at ~1.5 GB. M1 trials
that assume 4 GB will need either headroom or dynamic memory as the default.

## Declared weaknesses

Recorded rather than glossed:

1. **Provisional root on the attested host.** `trustPosture:
   provisional_personal_mvp`, `rootGeneratedOnAttestedHost: true`,
   `productionEligible: false`. The root vouches for the machine it lives on.
   Accepted deliberately for M0.5 and the personal MVP; rotate to an externally
   generated offline root before production.
2. **Boot id is host-observed, not guest-reported.** Hyper-V exposes no guest
   boot GUID over KVP without credentials, so it is derived as
   `sha256(vmGuid|powerOnTimeUtc)`. It identifies a power-on as seen by the
   host; it is not attested by the guest.
3. **The approval key lives on the same machine as the automation.** Genuine
   separation needs the reviewer key held elsewhere. An M1 decision.
4. **Secure Boot off** and **TPM unused**, as above.

## Not done

**Reboot verification remains a separate, explicitly approved step.** Host
attestation freshness across reboot, registry and key loading after restart,
evidence persistence, nonce replay rejection after restart, old boot-id
rejection, new host/guest boot identity, and ledger continuity are all untested.

## Freeze recommendation

The evidence envelope and transition-ledger core behaved correctly against real
data. They are ready to freeze as **contract v2.1** once reboot verification
passes. M0 should then be re-attested under the live registry once, rather than
regenerating keys repeatedly.

---

## Addendum — reboot verification and contract v2.2

**Reboot verification did not run.** The first attempt was void: the machine
never restarted. Uptime was 2 days 1 hour, the last OS start event was
2026-08-03T13:53, and `LastBootUpTime` was byte-identical across the supposed
restart. Fast Startup is enabled (`HiberbootEnabled = 1`), so a shutdown plus
power-on resumes from the hiberfile and produces the same false result; only an
explicit **Restart** performs a full boot. The persistence, key-loading, and
ledger-continuity checks are therefore still unproven across a real restart.

**A real contract gap was found anyway,** and it did not depend on the reboot —
it reproduces on a machine that never restarted. A fully valid, correctly
signed record naming the boot of a destroyed Field generation was accepted.

The first version of that probe scored a **pass** for the wrong reason: it
reused the sample record's artifact and nonce, so it was rejected for artifact
reuse and a broken signature rather than anything about boots. The probe now
uses a fresh artifact, a fresh nonce, and a valid host signature, and only
counts a rejection whose reason actually mentions a boot, supersession, or
staleness. With that correction the gap was unambiguous.

**Closed by the Field lifecycle ledger (v2.2).** See
[`../COMPLETION_GATE_V2.md`](../COMPLETION_GATE_V2.md). Validated on hardware
with a second disposable Field, `6fe7bf2b-7c62-4115-9a03-4f08f83bdc01`
generation 1, boot `boot-7dfb720f84a05ff2`:

| Step | Result |
| --- | --- |
| `created` recorded with the base image hash | yes |
| `booted` recorded; guest heartbeat OK in 31 s | yes |
| Evidence inside the open boot window | verified, 0 integrity failures |
| `stopped` recorded, then evidence attempted under the closed boot | **rejected** — `observed after boot boot-7dfb720f84a05ff2 ended` |
| `destroyed` recorded; Field removed | 23 prior field directories and the G4 VM untouched |
| v25 immutable base | unchanged |

The two original M0.5 evidence records were removed rather than back-dated.

**Still outstanding:** a genuine restart, to prove persistence, key loading, and
ledger continuity survive one.
