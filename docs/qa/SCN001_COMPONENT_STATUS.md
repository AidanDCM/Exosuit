# SCN-001 component status

Consolidated source audit refreshed 2026-09-15. Gate status: **`source_validated`**. Promotion denied until the required live ceremonies are observed and recorded.

The authenticated scene path now exists end to end in source, including a concrete Hyper-V guest-exchange reader and a read-only host probe. This page separates **implemented** from **live-proven** so source completeness is never mistaken for promotion evidence.

## The path, end to end

```
Glove producer (unprivileged, interactive session)
  └─ FieldSceneProducerBoundary   sanitize + bound the structural scene
  └─ FieldSceneProducerClient     one length-prefixed frame, then close
        │  named pipe, exact generation + boot, ACL: SYSTEM + one interactive SID
        ▼
Field service (SYSTEM)
  └─ FieldSceneRelayPipeServer            one connection, one bounded frame
  └─ FieldSceneRelayWindowsClientResolver facts from Windows, not from the frame
  └─ FieldSceneRelayBoundary              the only place an envelope is signed
  └─ FieldKvpRuntime.PublishScene         writes Exosuit.Field.Scene
  └─ FieldSceneProducerLauncher           starts the producer in the approved session
  └─ FieldSceneLifecycle / FieldSceneSupervisor / FieldSceneSessionRunner
        │  Hyper-V KVP
        ▼
Host
  └─ createHyperVGuestExchangeReader  concrete read-only Hyper-V/CIM adapter
  └─ readGuestKvpSnapshot             constrained VM name; failed read ≠ empty exchange
  └─ parseGuestExchangeItems          CIM-XML without an XML parser
  └─ readKvpValue                     chunk reassembly + digest
  └─ readSceneFromKvp                 absent / unreadable / rejected / accepted
  └─ FieldSceneChannelReceiver        signature, binding, replay
  └─ FieldSceneHostMonitor            readiness, one-way invalidation, observability barrier
```

`scripts/scn001-host-probe.ts` is the narrow executable seam for the concrete host adapter. Run it on the Windows Hyper-V host with:

```powershell
npx tsx scripts/scn001-host-probe.ts --vm-name <exact-field-vm-name>
```

The probe deliberately prints only KVP names/counts and whether `Exosuit.Field.Scene` is present; it does **not** print KVP values or scene payloads. A successful probe demonstrates host-query capability only and is not SCN-001 completion evidence.

## Component status

| Component | Side | Tests | Live-exercised |
|---|---|---:|---|
| `FieldSceneProducerBoundary` | Glove | yes | no |
| `FieldSceneProducerClient` | Glove | 11 | no |
| `FieldSceneRelayPipeServer` | Field | 14 | no |
| `FieldSceneRelayWindowsClientResolver` | Field | 3 | no |
| `FieldSceneRelayBoundary` | Field | yes | no |
| `FieldSceneRelayIntakeService` | Field | via runner | no |
| `FieldKvpRuntime.PublishScene` | Field | 6 | no |
| `FieldSceneProducerLauncher` | Field | 13 | no |
| `FieldSceneLifecycle` | Field | 30 | no |
| `FieldSceneSupervisor` | Field | 17 | no |
| `WindowsFieldSceneEnvironment` | Field | 10 | **partly** — real processes only |
| `FieldSceneSessionRunner` / config | Field | 23 | no |
| `RunGuestAsync` scene hook | Field | 7 | no |
| `WindowsFieldSceneSessionPorts` | Field | **0** | no |
| `fieldKvpHostQuery` | Host | 8 | no |
| `fieldKvpExchangeParser` | Host | 15 | no |
| `fieldKvpHyperVReader` | Host | 16 | no — concrete adapter not yet run against a live guest exchange |
| `fieldSceneKvpReader` | Host | 15 | no |
| `fieldSceneKvpIntake` | Host | 13 | no |
| `FieldSceneHostMonitor` | Host | 13 | no |

## What is genuinely proven

Given a correct observation, every covered component makes the intended decision and records the intended reason. The bindings — Field generation, boot, session, user, image digest, and display contract — are checked at their relevant boundaries. Failure paths are refusals, and the reasons are specific enough to match against an expected code.

`WindowsFieldSceneEnvironment` is the only adapter with any real-world coverage: process liveness and termination run against real Windows processes, and an unresolvable session is confirmed to read as locked.

The Hyper-V reader is source-complete: it passes the VM name out of band, requires exactly one matching VM, preserves UTF-8 through base64, normalizes PowerShell's one-item JSON shape, and feeds the real guest-exchange parser. Its source tests do **not** prove the CIM association or `GuestExchangeItems` shape on a running Field VM.

## What is not proven, stated plainly

- **No accepted scene has yet completed the required live SCN-001 path.** Source tests are not a substitute for the live matrix.
- `WindowsFieldSceneSessionPorts` still has **zero live coverage**: real `CreateProcessAsUser` across a session boundary, a real producer connecting, real signing of a real frame, and a real KVP write remain to be observed together.
- The concrete `GuestExchangeReader` and `scripts/field-kvp-powershell-runner.mjs` exist and are now constructible through `scripts/scn001-host-probe.ts`, but the PowerShell/CIM adapter still needs a live run against a running Field VM before its Hyper-V assumptions are evidence.
- Guest writer and host reader agree **by construction** and by matching `Read-ExosuitFieldGuestKvp.ps1`; they have not yet been proven against the same accepted live scene.
- Real lock and Secure Desktop transitions, `consent` detection, and PID reuse remain live-only risks.
- No poll cadence has been shown adequate. A slow cadence widens the window in which readiness outlives the desktop that justified it, and no unit test can establish the correct host cadence.

Component existence is not promotion evidence. Promotion still requires the complete matrix in `docs/project-driver/SCN001_SESSION_RUNBOOK.md`: a real guest scene crossing the authenticated path, bound to the correct Field, session, boot, generation, and display contract, with the required invalidation and lifecycle ceremonies.

## Design decisions that would be expensive to rediscover

- **The producer holds no authority.** It cannot sign, cannot read from the privileged side, and cannot hold a connection open. Everything it sends is re-derived from Windows.
- **The minimal pipe ACL was measured, not reasoned.** Two hand-derived access masks were wrong — one too tight to connect, one granting needless `CreateNewInstance`. Guessing a Windows access mask fails in both directions.
- **A boot change is terminal for its lifecycle.** Relaunching into it would re-establish readiness against a boot that has ended.
- **Unlocking alone never restores readiness**, on both sides. The desktop may have changed while nothing was observing it.
- **Transport faults and authentication failures stay separate** the whole way. A rejection only counts when it rejected for the exact intended reason.
- **A failed host read is not an empty exchange**, or a host fault would be blamed on the guest.
- **Scene production is opt-in.** An unconfigured guest behaves exactly as the one that produced the CHN-001 live evidence.
- **The live host probe does not dump scene contents.** It reports capability and KVP names only; evidence collection remains the harness/runbook's job.

## Current finish boundary

Hosted CI and Security Audit are green on the SCN-001 branch head. The remaining SCN-001 boundary is therefore not an unimplemented source component or a hosted-CI failure; it is live Windows/Hyper-V execution and evidence collection. The first executable check is the read-only host probe above. If that fails, fix the concrete adapter before attempting the full ceremony matrix. If it passes, proceed through `SCN001_SESSION_RUNBOOK.md` without treating the probe itself as promotion evidence.

## Related documents

- `docs/project-driver/SCN001_SESSION_RUNBOOK.md` — required live matrix and stop conditions.
- `docs/engineering_log/2026-08-11-scn001-hyperv-guest-exchange-reader.md` — concrete reader design and source validation.
- `docs/qa/ATOMIC_AUDIT_2026-08-11_FIELD_HYPERV_EXCHANGE_READER.md` — reader audit.
- Engineering logs and Level 4 audits dated 2026-08-10 through 2026-08-15 under `docs/engineering_log/` and `docs/qa/`.
- `COMPLETION_APPROVAL_INDEPENDENCE.md` — separate approval-independence work.
