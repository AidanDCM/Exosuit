# SCN-001 component status

Consolidated view as of 2026-08-11. Gate status: **`source_validated`**. Promotion denied.

Twelve engineering logs and audits now cover this path. This page exists so the answer to "what
is built and what is actually proven" does not require reading all of them in order.

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
  └─ readGuestKvpSnapshot        constrained VM name; failed read ≠ empty exchange
  └─ parseGuestExchangeItems     CIM-XML without an XML parser
  └─ readKvpValue                chunk reassembly + digest
  └─ readSceneFromKvp            absent / unreadable / rejected / accepted
  └─ FieldSceneChannelReceiver   signature, binding, replay
  └─ FieldSceneHostMonitor       readiness, one-way invalidation, observability barrier
```

## Component status

| Component | Side | Tests | Live-exercised |
|---|---|---|---|
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
| `fieldSceneKvpReader` | Host | 15 | no |
| `fieldSceneKvpIntake` | Host | 13 | no |
| `FieldSceneHostMonitor` | Host | 13 | no |

## What is genuinely proven

Given a correct observation, every component makes the right decision and records the right
reason. The bindings — Field generation, boot, session, user, image digest — are checked at each
boundary rather than once. Failure paths are refusals, and the reasons are specific enough to
match against an expected code.

`WindowsFieldSceneEnvironment` is the only adapter with any real-world coverage: process liveness
and termination run against real Windows processes, and an unresolvable session is confirmed to
read as locked.

## What is not proven, stated plainly

- **No scene has ever crossed this path.** Not once, not partially.
- `WindowsFieldSceneSessionPorts` has **zero** coverage: real `CreateProcessAsUser` across a
  session boundary, a real producer connecting, real signing of a real frame, a real KVP write.
- No `GuestExchangeReader` implementation exists, so the host path has never queried Hyper-V.
- Guest writer and host reader agree **by construction** and by matching
  `Read-ExosuitFieldGuestKvp.ps1` — never by an end-to-end run against the same live data.
- Real lock and Secure Desktop transitions, `consent` detection, and PID reuse are untested; a
  test cannot lock the developer's own desktop.
- No poll cadence has been shown adequate. A slow cadence widens the window in which readiness
  outlives the desktop that justified it, and no unit test can detect that.

Component existence is not promotion evidence. Promotion needs a real guest scene crossing the
authenticated path, bound to the correct Field, session, and boot, and becoming invalid when the
desktop state changes.

## Design decisions that would be expensive to rediscover

- **The producer holds no authority.** It cannot sign, cannot read from the privileged side, and
  cannot hold a connection open. Everything it sends is re-derived from Windows.
- **The minimal pipe ACL was measured, not reasoned.** Two hand-derived access masks were wrong —
  one too tight to connect, one granting needless `CreateNewInstance`. Guessing a Windows access
  mask fails in both directions.
- **A boot change is terminal for its lifecycle.** Relaunching into it would re-establish
  readiness against a boot that has ended.
- **Unlocking alone never restores readiness**, on both sides. The desktop may have changed while
  nothing was observing it.
- **Transport faults and authentication failures stay separate** the whole way. A rejection only
  counts when it rejected for the exact intended reason.
- **A failed host read is not an empty exchange**, or a host fault would be blamed on the guest.
- **Scene production is opt-in.** An unconfigured guest behaves exactly as the one that produced
  the CHN-001 live evidence.

## Related documents

Engineering logs and Level 4 audits dated 2026-08-10 and 2026-08-11 under
`docs/engineering_log/` and `docs/qa/`, prefixed `scn001-` and
`ATOMIC_AUDIT_*_FIELD_SCENE_*`. Approval-independence work is separate: see
`COMPLETION_APPROVAL_INDEPENDENCE.md`.
