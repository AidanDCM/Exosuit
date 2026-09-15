# Level 4 Addendum: Scene Session Authoring Command

**Date:** 2026-08-11

**Verdict:** pass; an invalid scene session can no longer be authored, and no second copy of the
validation rules was created

## Safety question

Can a configuration reach the guest that the runtime will refuse, silently disabling scene
production — or that the launcher will refuse, failing on the guest where it is expensive to
notice?

## Implemented controls

- **One implementation of the rules.** The command calls
  `FieldSceneSessionConfiguration.Validate`, the same method the guest runtime calls. A separate
  authoring validator could drift; this cannot. The round trip through the runtime's own
  `ReadOptional` is asserted by test.
- **The digest is computed from the producer image, never accepted from the request.** A supplied
  digest proves nothing about the file that will run. A request carrying
  `producerExecutableSha256` is rejected rather than ignored, so a caller who believes they are
  pinning a digest is told otherwise.
- **The image is opened without delete sharing** while hashed, so it cannot be swapped mid-read.
- **Validation precedes the write**, so a rejected request leaves no partial file.
- **An existing session file is never overwritten.** Silently replacing a live session file,
  possibly on a Field mid-ceremony, is the side effect the opt-in default exists to prevent.
- Session zero, non-`S-1-5-21-` SIDs, malformed digests, and out-of-range cadences are refused at
  authoring time rather than at guest start.

## Evidence and residual risk

Fifteen tests; Release build clean with `-warnaserror`. The CLI was exercised end to end rather
than only unit-tested: it produced a valid configuration with a correctly computed digest, and a
second invocation refused to overwrite and exited 1.

Residual: the command has never run on a guest, against the real installed producer, or with a
real interactive user SID. It validates the *shape* of a configuration; whether a given session ID
and owner SID are the correct ones for a particular Field is an operator judgement it cannot make.
A well-formed configuration naming the wrong session would author successfully and fail at launch.
SCN-001 remains `source_validated`.

## Rollback

Remove the command, its `Program` entry, and its tests. No runtime behaviour depends on it.
