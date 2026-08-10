# Level 4 Addendum: Field Scene One-Way Pipe Intake

**Date:** 2026-08-10

**Verdict:** source/local transport pass; live SYSTEM-to-interactive operation and production launcher unproven

## Safety question

Can an unapproved local process reach the privileged scene intake, exhaust or stream at it,
observe another producer's frames, squat its name, or obtain more than one signing
opportunity per boot?

## Implemented controls

- The intake refuses to exist for a non-SYSTEM caller: identity is asserted before a pipe
  name is owned, so an unprivileged process cannot stand up the listener at all.
- The pipe name binds the exact Field ID, generation, and boot ID. A producer holding a name
  from a previous generation or a previous boot cannot reach the current intake.
- The ACL names only SYSTEM and the one approved interactive user SID. Every other principal
  — Everyone, Authenticated Users, Administrators, anonymous, network — is absent and falls
  to the default deny. The SID must be a local interactive `S-1-5-21-` account; SYSTEM,
  Everyone, and blank SIDs are rejected at construction.
- Producer rights are the empirically minimal connect set: write, `FILE_READ_ATTRIBUTES`,
  and `SYNCHRONIZE`. `ReadData` is withheld, so the producer cannot read back from the
  privileged side. `CreateNewInstance` is withheld, so it cannot stand up a rival instance on
  the name and squat the intake. `ChangePermissions` and `TakeOwnership` are withheld, so it
  cannot widen the ACL.
- The pipe is one-way inbound with a single server instance. The Field never writes, so the
  privileged side cannot be turned into a push channel into the producer.
- A frame declares its length in a four-byte big-endian header. The declaration is validated
  against the 12 KiB structural payload bound *before* any payload byte is read; zero-length
  and oversized declarations cost nothing to reject.
- Exactly one frame per connection. Trailing bytes after the declared payload reject the
  whole connection rather than being treated as a second message or partly trusted.
- The connection budget is one per instance and is spent *before* the accept is awaited, so a
  cancelled, denied, or failed frame cannot be retried on the same instance. A further frame
  requires a newly authorised server.
- Client facts still come from `FieldSceneRelayWindowsClientResolver` — derived from Windows
  and the connected pipe, never from frame bytes — and still pass through
  `FieldSceneRelayBoundary` before any signature exists. The transport decides nothing about
  trust.
- The intake service refuses to sign when the intake's Field generation or boot ID differs
  from the policy's, so bytes accepted for one boot cannot be signed into another.

## Evidence and residual risk

Fourteen focused tests cover non-SYSTEM construction denial, empty boot identity, four
rejected producer-SID shapes, exact-generation/boot name binding, the full ACL grant and
withhold set, a real local Windows connection returning matching PID/SID and payload, budget
spend after both success and rejection, zero-length declaration, oversized declaration,
truncation before the declared length, and a second frame on one connection. The full agent
suite is 107/107.

The minimal producer right set was determined by probing the platform, not assumed; an
earlier hand-derived `FILE_GENERIC_WRITE` set was denied at `CreateFile` and a
`CreateNewInstance` grant proved unnecessary. This matters because the first two guesses
would each have shipped a wrong ACL — one too tight to work, one granting pipe-instance
creation for no reason.

Unproven: real LocalSystem-to-interactive operation across a session boundary, the
session-local producer launcher, PID reuse and client-exit races during resolution, installed
agent path ACL, KVP scene write/read, backpressure under sustained production, and behaviour
across lock and Secure Desktop transitions. Evidence is source/local only. This is not a live
SCN-001 pass and promotes nothing.

## Rollback

Remove `FieldSceneRelayPipeServer`, `FieldSceneRelayIntakeService`, and their tests, or leave
them unwired. No current runtime constructs the intake and no scene publication path exists.
