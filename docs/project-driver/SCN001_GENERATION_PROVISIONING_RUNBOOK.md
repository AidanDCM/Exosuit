# Provisioning a fresh Field generation and verifying its channel

## Purpose and boundary

SCN-001 cannot begin. This runbook covers the two steps that must happen first:

1. Stand up a new generation of Field `4401b702-334f-475e-b867-b7d06798443d` from base
   `exosuit-field-base-v26`.
2. Verify that exact generation's authenticated channel, and record the verification SCN-001 will
   cite.

It does **not** re-run CHN-001, and it does not touch any gate status. CHN-001 is passed and stays
passed. It also does not author a scene session, produce a scene, or record any SCN-001 evidence.

Nothing here is autonomous. Every step that changes machine state is an owner ceremony.

## Why this is required

CHN-001 was proven on this Field, but on a generation that no longer exists:

| Run | Field | Generation | VM | State |
|---|---|---|---|---|
| CHN-001 G1 | `4401b702…` | 1 | `c9a988db…` | destroyed |
| CHN-001 G3 (authoritative) | `4401b702…` | 3 | `b538709f…` | destroyed at cleanup |

The only VM currently on the host is `Exosuit-Field-c7dead44-f5e4-48c8-aa2d-a12a8902ea75-G4`,
which belongs to a **different Field** and was never part of any CHN-001 run.

> **Do not adopt G4.** It is not a later generation of the CHN-001 Field; it is an unrelated Field.
> Using it would break continuity with the authoritative CHN work and would prove nothing about
> the channel SCN-001 rides. Leave it `Off` and untouched.

A gate and a verification are different things. CHN-001 is a gate over the channel design: it is
passed, globally, and a new generation inherits it. Channel verification is a property of one
generation's running channel — its key, its boot, its replay state — and it does not transfer when
a generation is destroyed and another stood up. `src/completion/scn001.ts` enforces exactly that
distinction and will refuse a candidate that confuses them.

## Entry conditions

- The host worktree is clean and at the commit the guest agent will be built from. The host
  verifier and the guest agent must come from one commit.
- `C:\ProgramData\Exosuit\Images\exosuit-field-base-v26.vhdx` is present and its digest is
  recorded before anything runs. The base is immutable and must be unchanged at the end.
- The Field root `C:\ProgramData\Exosuit\Fields\4401b702-334f-475e-b867-b7d06798443d` exists. It is
  currently empty, which is the expected post-cleanup state, not a fault.
- An elevated session is available. The known blocker on this machine is the UAC-filtered token:
  Hyper-V and Field owner operations need a genuinely elevated context, not merely an admin
  account.
- No `scene-session.json` exists anywhere in the new generation. Scene production stays off for
  the whole of this runbook.

## Step 1 — Record the starting state

Before changing anything, capture what must be unchanged afterwards.

- The base image digest.
- The current VM inventory, so the new VM is identifiable as new and G4 is demonstrably untouched.
- The existing generation directories under the Field root, so the new generation number is chosen
  rather than assumed.

The new generation must be **higher than every generation that has ever existed** for this Field,
including destroyed ones. Reusing a number a destroyed generation held would make old evidence
ambiguous about which run it describes.

The Field root cannot answer this. It exists but is empty — CHN-001 cleanup removed every
generation directory (`generationRootAbsent: true`), so the filesystem has no memory of what was
used. The CHN-001 artifacts do:

| Generation | Evidence root | Outcome |
|---|---|---|
| 1 | `chn001-v26-g1-*` (three sessions) | superseded |
| 2 | `chn001-v26-g2-c93844a-*` | aborted early |
| 3 | `chn001-v26-g3-48b5071-*` | authoritative, passed, destroyed |

**Generations 1, 2 and 3 are consumed. The next generation is 4.**

Derive this from `artifacts/chn001/*/session.json`, not from the disk and not from this table,
which is a record of what was true on 2026-08-11.

## Step 2 — Provision the new generation

Owner ceremony, through the reviewed Field provisioning authority. Not by hand, and not by editing
configuration files.

The provisioning plan must satisfy the same production isolation contract CHN-001 ran under:

- no development access, no unattended-setup development path;
- network mode isolated, no host LAN access, no inbound connections;
- no host input injection;
- base image attached read-only, digest matching the recorded value.

Stop if the plan contains a development-access block. That is the shape of configuration that has
produced false confidence on this project before.

## Step 3 — Verify this generation's authenticated channel

This is the step whose output SCN-001 cites. The goal is a positive, dated statement that *this*
generation's channel authenticates — not a re-derivation of CHN-001's negative matrix.

Minimum for the verification to mean anything:

- a verified handshake bound to Field `4401b702…` and the **new** generation;
- a verified bootstrap status;
- at least three verified heartbeats, with strictly increasing sequence and a stable boot id;
- every message authenticated under the new generation's channel key, which must not be a key any
  previous generation used;
- no message accepted across a boot-id boundary.

Record, as the verification result:

```
channelVerifiedFieldId     4401b702-334f-475e-b867-b7d06798443d
channelVerifiedGeneration  <the new generation number>
channelVerificationRunId   <the id of this verification run>
result                     verified
verifiedAt                 <canonical UTC, before any SCN-001 session starts>
evidenceSha256             <digest of the verification evidence>
```

`verifiedAt` must precede the SCN-001 session's `startedAt`. The contract rejects a channel
verified after the session began, because a session that started on an unverified channel is not
retroactively repaired by verifying it later.

### What would make this verification worthless

- Verifying against a receiver the same run configured from the same values it is trying to prove.
  The binding has to be to the Field and generation identity as provisioned, not as asserted.
- Reusing a previous generation's channel key. A scene authenticating under generation 3's key
  proves the key survived, not that generation 4's channel is sound.
- Accepting a heartbeat whose boot id differs from the handshake's. That is two boots being
  treated as one channel.

## Step 4 — Hand off to SCN-001

Write the verification into the SCN-001 harness configuration under
`channelVerifiedForGeneration`, alongside the new generation's Field reference, VM GUID, boot id,
agent id, channel key id, and the producer path and image digest.

`scn001Harness.ts start` refuses, before touching anything, if:

- the verified Field id is not the Field being run against;
- the verified generation is not the generation being run against;
- the base image digest does not match the bytes on disk.

Those refusals are the point. If `start` refuses, the fix is upstream in this runbook, never in the
configuration file.

Only then does `docs/project-driver/SCN001_SESSION_RUNBOOK.md` apply: author `scene-session.json`
inside the guest with the interactive session id and user SID read from **inside** the guest, and
run L1 through L11.

## Rollback

- Destroy the new generation through owner authority. It is disposable by construction; nothing in
  this runbook writes personal state.
- The base image is never modified. Confirm its digest is unchanged as the last act.
- G4 is not touched at any point, so there is nothing to restore.
- No gate status changes, so there is nothing to unwind in the ledger.

## What this runbook must not be used to justify

Completing it proves one thing: this generation's channel authenticates. It is not scene evidence,
not SCN-001 progress, and not a promotion of anything. The completion validator will read exactly
the same after it as before — 32.39% proven, SCN-001 `source_validated`. If any number moves,
something recorded evidence that should not have.
