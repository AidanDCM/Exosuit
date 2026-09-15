# Level 4 atomic audit: scene pipe generic-write standard right

**Gate:** M2 / SCN-001  
**Decision:** focused source validation passed; live promotion denied

Generation 14 proved the medium mandatory label alone did not admit the exact interactive producer: Windows still denied `NamedPipeClientStream.TryConnect`. The remaining access mismatch is `READ_CONTROL`, a standard right included in the Windows generic-write mapping. Local transport tests had the creating user as object owner and therefore did not reproduce SYSTEM ownership.

The producer ACE now adds `PipeAccessRights.ReadPermissions` only. This permits reading the object's security descriptor; it does not permit reading pipe data, changing the descriptor, taking ownership, creating another server instance, or accessing another principal's pipe. The exact-SID DACL, medium/no-write-up label, Windows-derived identity checks, image digest, generation/boot binding, and bounded one-frame protocol remain unchanged. Fresh immutable-generation evidence is required.

Repository, plan, and Field-contract validators and TypeScript typecheck passed. The .NET Release build passed with warnings treated as errors, and the focused relay/client suites passed 26/26. A combined full-suite command exceeded the orchestration time limit, so this audit does not claim that gate passed for this slice.
