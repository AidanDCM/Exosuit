# Level 4 Addendum: Offline Guest Inspector

**Date:** 2026-07-28

**Verdict:** source/static pass and one live v14 read-only inspection pass; broad host matrix unproven

## Safety question

Can guest diagnosis alter a running Field, mount the wrong disk writable, leak secrets/private logs, hang indefinitely, or leave the overlay attached?

## Implemented controls

- Exact GUID/generation paths are derived beneath `C:\ProgramData\Exosuit\Fields`.
- The tool reads VM state through a bounded job and refuses every state except `Off`.
- It contains no start, stop, remove, or VHD-write operation.
- The Storage provider mounts the overlay with `-Access ReadOnly`.
- Mount, Hyper-V query, and dismount are independently bounded.
- Evidence includes file names, sizes, SHA-256 digests, and selected scheduled-task metadata only.
- Configuration and log contents are never read into evidence.
- Output is written through a same-directory temporary file and replaced atomically.

## Live evidence and residual risk

The v14 generation `b449d4f1-334f-495e-9e99-513220339d56` was inspected while off. The overlay mounted read-only and dismounted successfully. Agent/config files and a LocalSystem boot/logon task were present. This disproved the missing-binary hypothesis but did not establish why startup failed before fresh KVP publication.

One earlier ad-hoc probe wedged in the Storage provider and was terminated after its parent timeout; the canonical tool bounds its provider calls. Windows provider behavior after host sleep and dismount failure still require negative live tests. No production promotion follows.

## Rollback

Remove the inspector. It is diagnostic-only and no runtime depends on it.
