# Level 4 Addendum: Windows Scene Relay Client Resolver

**Date:** 2026-08-10

**Verdict:** source/local adapter pass; production IPC and live SYSTEM acceptance unproven

## Safety question

Can an interactive process obtain scene-signing authority by supplying its own PID, session, SID, image path, or digest rather than having the privileged relay derive those facts from Windows?

## Implemented controls

- Resolution requires the SYSTEM boundary identity and an already connected Windows named-pipe server.
- The client PID comes from `GetNamedPipeClientProcessId`, not from payload bytes.
- Session and full image path come from the resolved process; the user SID comes from that process token.
- The executable is opened read-only without delete sharing while SHA-256 is computed.
- Session zero, missing image/SID, disconnected pipe, process exit during inspection, native lookup failure, and access denial fail closed without returning facts.
- The resulting facts still pass through the separate relay policy and canonical scene boundary before any signature exists.

## Evidence and residual risk

Focused tests cover non-SYSTEM and disconnected denial plus one real local Windows named-pipe connection that matches the current PID/session/SID/path and returns a lowercase SHA-256. There is no production pipe name, ACL, framing protocol, connection budget, session-local launcher, or KVP writer. PID reuse, client exit timing, installed-file replacement policy, and real LocalSystem-to-interactive operation require dedicated live failure injection. The adapter is not a live SCN-001 pass.

## Rollback

Leave `FieldSceneRelayWindowsClientResolver.ResolveConnectedClient` unwired or remove the file/tests. No current runtime calls it and no scene publication path exists.
