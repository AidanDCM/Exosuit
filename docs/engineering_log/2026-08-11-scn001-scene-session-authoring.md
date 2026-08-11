# SCN-001 scene session authoring command

- **Goal:** make `scene-session.json` something that is generated and validated rather than
  hand-written, so an invalid configuration cannot reach the guest runtime.
- **Master-plan phase/gate:** M2 / SCN-001; no live promotion.
- **Files changed:** `FieldSceneSessionAuthoringCommand` (new), a `--field-author-scene-session`
  entry in `Program`, tests, this log, a Level 4 audit.

## Why this is a C# command and not a TypeScript tool

The validation rules already exist, in `FieldSceneSessionConfiguration.Validate`, and the guest
runtime calls that method. An authoring tool in another language would be a **second
implementation of those rules**, free to drift from the runtime's. This branch has already shown
what that costs: the KVP wire format had three implementations agreeing only by construction, and
binding them to one fixture was a whole slice of work.

So the command reuses `Validate` directly. There is no second copy of the rules to keep in step,
and a config this tool accepts is by construction a config the runtime accepts.

## Three decisions

**The digest is computed, never supplied.** A caller-provided digest proves nothing about the
file that will actually run — the same reasoning the launcher applies before
`CreateProcessAsUser`. A request that tries to carry `producerExecutableSha256` is *rejected*
rather than ignored, so a caller who believes they are pinning a digest is told they are not.

**Validation runs before the write.** A rejected request leaves no partial file behind, so a
half-authored session cannot be picked up later.

**An existing session file is never overwritten.** Enabling scene production is a deliberate act;
silently replacing a live session file — possibly on a Field that is mid-ceremony — is exactly
the side effect the opt-in default exists to prevent. Removing the old file is the deliberate
step, and the error says so.

## The property the tests exist for

`WhatItWritesIsExactlyWhatTheGuestRuntimeReadsBack` authors a file and reads it back through
`FieldSceneSessionConfiguration.ReadOptional`, the guest runtime's own reader. A tool that
produced a file the guest silently declined would be worse than no tool at all, because the
failure would appear as a guest that quietly does not produce scenes.

Authoring a **disabled** session is legitimate and tested: it stages a configuration without
turning scene production on.

- **Identity/generation/policy impact:** none at runtime. The command adds no authority and runs
  no ceremony; it writes a file the runtime already knows how to refuse.
- **Tests:** 15 — digest computation, digest recomputation after the image changes, missing image,
  a request supplying its own digest, session zero, three bad SIDs, two out-of-range cadences,
  the read-back round trip, disabled sessions, overwrite refusal, and no partial file on failure.
- **Commands actually run:** .NET SDK 8.0.423 Release build with `-warnaserror`, focused tests, and
  a real end-to-end invocation of the CLI.
- **Results/evidence:** build 0 warnings / 0 errors; focused suite 15/15. The CLI was exercised
  for real: it emitted a valid config with a correctly computed digest, and a second run against
  the same output exited 1 with "already exists. Remove it deliberately before authoring a new
  scene session."
- **Unvalidated:** the command has never been run on a guest, against the real installed producer
  at `C:\Exosuit\Agent\Exosuit.Agent.exe`, or with a real interactive user SID. Whether the
  authored file is *correct* for a given Field — right session, right owner — is an operator
  judgement this tool validates the shape of but cannot make. SCN-001 remains `source_validated`.
- **Security/privacy:** reads the producer image to hash it; writes one configuration file. No
  secrets, no logging.
- **Rollback:** remove the command, its `Program` entry, and its tests. No runtime behaviour
  depends on it.
