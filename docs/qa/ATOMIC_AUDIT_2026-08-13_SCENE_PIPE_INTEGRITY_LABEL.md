# Level 4 atomic audit: scene pipe mandatory-integrity label

**Gate:** M2 / SCN-001  
**Decision:** source validation passed; live promotion denied

Generation 13 proved the exact producer SID could read its sealed configuration, then Windows denied `NamedPipeClientStream.TryConnect` before the relay could resolve the connected process. The exact-SID DACL was present and protected. The remaining Windows boundary is mandatory integrity: LocalSystem creates the pipe above the normal interactive producer's integrity level.

The intake now carries the medium-integrity `no-write-up` mandatory label. This does not grant a broad principal access: the DACL still names only LocalSystem and the exact approved interactive SID. A low-integrity process remains unable to write, and any admitted connection remains untrusted until Windows-derived PID, session, SID, executable path, executable digest, liveness, Field generation, boot identity, and bounded frame checks pass. Fresh immutable-base evidence is required; SCN-001 remains unpromoted.

Repository, master-plan, and Field-contract validators passed. TypeScript typecheck and build passed. The Field suite passed 263/263, the full repository suite passed 875/875, and both system pulses passed. The .NET Release build passed with warnings treated as errors and all 289 agent tests passed. These results validate the source boundary but do not substitute for a fresh-generation Windows integrity test.
