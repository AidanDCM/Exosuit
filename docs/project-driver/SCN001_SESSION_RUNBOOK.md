# SCN-001 session runbook

## Purpose and boundary

SCN-001 proves that a real guest scene crosses the authenticated path, binds to the correct
Field, session, and boot, and becomes invalid when the desktop state changes. It does not prove
actions, Teach, Shadow, Pilot, MCP, or production, and it does not re-prove CHN-001.

**Component existence is not promotion evidence.** Every piece of this path exists in source with
unit coverage, and none of it has ever run against a guest. The purpose of this session is to
find out where that source is wrong.

> **On the structural budget:** an earlier revision of this runbook said the budget defect blocks
> L2 and L3 outright. That was based on an unmeasured assumption and is **corrected**: measured on
> a real desktop the observation was 9 windows and 14 elements, which fits. Elements come from the
> *active window's descendants only*, so the risk depends on which window is focused, not on how
> cluttered the desktop is. Run L2 with a simple window focused; expect a budget rejection if a
> browser or file manager has focus.

## Entry conditions

- CHN-001 is proven for the Field generation in use, or a new generation is stood up and its
  channel is verified first. A scene rides the same authenticated channel; a scene session on an
  unverified channel proves nothing about either.
- The guest agent is built from the reviewed commit and installed at the fixed producer path.
- A local owner can perform the visible lock, Secure Desktop, and reboot ceremonies, and can read
  the guest's own interactive session ID and user SID from inside the guest.
- No `scene-session.json` exists yet. Scene production is off until one is authored, and an
  unconfigured guest behaves exactly as the one that produced the CHN-001 evidence.
- The host verifier and the guest agent come from the same commit. A scene written by one and read
  by another proves nothing about either.

## Authoring the session file

Never hand-write `scene-session.json`. Author it:

```
Exosuit.Agent.exe --field-author-scene-session <request.json> C:\Exosuit\Config\scene-session.json
```

The request carries everything except the digest, which is computed from the producer image on
disk. A request that tries to supply `producerExecutableSha256` is rejected rather than ignored.

Two values must come **from inside the guest**, not from assumption:

- `expectedSessionId` — the interactive session the owner is actually logged into.
- `interactiveUserSid` — that session's user SID, e.g. from `whoami /user`.

The command validates the shape using the runtime's own rules, so a file it accepts is one the
runtime accepts. It cannot tell you whether the session and SID are the *right* ones for this
Field. A well-formed file naming the wrong session authors cleanly and fails at launch.

Author with `"enabled": false` first, inspect the output, and enable deliberately. An existing
session file is never overwritten; removing it is the deliberate step.

## Required live matrix

Nothing below can be satisfied by a source test, a fabricated payload, or a scene manufactured on
the host.

| # | Ceremony | Expected |
|---|---|---|
| SCN-001.L1 | Producer launch | Producer starts in the approved interactive session as the approved user, from the pinned image. |
| SCN-001.L2 | First scene | One scene crosses producer → intake → relay signature → `Exosuit.Field.Scene` → host read → accepted, bound to the exact Field, generation, boot, and session. |
| SCN-001.L3 | Chunked scene | A scene large enough to chunk reassembles and authenticates on the host. |
| SCN-001.L4 | Lock | Readiness clears on both sides while the producer keeps running. |
| SCN-001.L5 | Unlock | Readiness does **not** return until a scene captured *after* the unlock arrives. |
| SCN-001.L6 | Secure Desktop | Readiness clears; no scene is promoted from a UAC prompt. |
| SCN-001.L7 | Producer death | Kill the producer. Readiness clears and the supervisor relaunches. |
| SCN-001.L8 | Guest reboot | Prior scene invalidates, boot change is terminal, a new session is required. |
| SCN-001.L9 | Stale generation | A scene from another generation is rejected. |
| SCN-001.L10 | Missing/corrupt value | Clear or damage the scene value. The host invalidates and does not reuse the last good scene. |
| SCN-001.L11 | Teardown | The exact producer is terminated with the Field lifecycle; no orphan survives. |

L5 deserves attention. It is the case both halves of the channel were originally wrong about, and
the scene it must reject is valid by every other check — correct signature, boot, session, and
sequence. If L5 passes trivially, confirm the scene under test was genuinely captured before the
lock, or it has proven nothing.

## Stop conditions

Stop without recording completion evidence if:

- a scene is accepted that is bound to a different Field, generation, boot, or session;
- readiness survives a lock, Secure Desktop, reboot, or producer death;
- readiness returns after an unlock without a fresh scene;
- the host reuses a previous scene after a missing or corrupt value;
- a producer survives teardown;
- the guest or host identity changes mid-session;
- a rejection occurs for a reason other than the intended one. A right answer for the wrong reason
  is a failure, not a pass. This project has produced false greens exactly there before.

## Where this is most likely to break first

Stated so a failure is recognised rather than debugged blind. In rough order of likelihood:

0. **The 12 KiB structural bound, if a complex window has focus.** The ceiling is 34–39 elements
   depending on window count, at ~290 bytes per element. Elements come from the active window's
   descendants only: a console or small dialog measured at 14 and fits; a browser or file manager
   can have hundreds and will be rejected outright, since the boundary rejects rather than
   truncates. Not a certain blocker — a conditional one. See
   `docs/qa/OPEN_RISK_2026-08-11_SCENE_STRUCTURAL_BUDGET.md`.
1. **`WindowsFieldSceneSessionPorts`** — zero coverage. Real `CreateProcessAsUser` across a
   session boundary, a real producer connecting to the intake, real signing of a real frame, a
   real KVP write. Any of these can be wrong.
2. **The Hyper-V exchange reader** — partially resolved. The namespace, `Msvm_ComputerSystem`, and
   the name filter were verified read-only against this host and match exactly one VM. The
   association to `Msvm_KvpExchangeComponent` and the shape of `GuestExchangeItems` remain
   unproven, because that component only exists while a VM is running.
3. **Producer image ACL** — the installed path ACL is assumed, not proven. The *path* itself is no
   longer a risk: the session configuration now refuses any producer path the relay would reject,
   at authoring time.
4. **Poll cadence** — bounded to 250–10,000 ms but no value has been shown adequate. Too slow and
   host readiness outlives the desktop that justified it, which no unit test can detect.
5. **The pipe ACL under a real cross-session client** — the minimal right set was measured
   locally, as the same user. SYSTEM serving a different interactive user is not the same case.

## Evidence

Capture per ceremony, under an `artifacts/scn001/<run-id>/` root, following the CHN-001 layout: a
raw result and a processed artifact per ceremony, plus the envelopes actually observed. Do not
hand-edit signed evidence. If an artifact is wrong, replace it through a new attested run.

Recording completion evidence for SCN-001 additionally requires the host-signed lifecycle binding
the exact VM and base, as for CHN.

## Rollback

- Delete or disable `C:\Exosuit\Config\scene-session.json`. The guest returns to exactly its
  pre-session behaviour; scene production is off with no file present.
- Terminate the producer if teardown did not.
- Destroy the exact generation through owner authority if the session is abandoned.
- No host change is required. Nothing in this session alters the base image or the host.
