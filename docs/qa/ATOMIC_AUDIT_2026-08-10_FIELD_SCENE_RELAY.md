# Level 4 Addendum: Structural Scene Relay Signing Boundary

**Date:** 2026-08-10

**Verdict:** compiled source/unit signing boundary pass; IPC, OS fact resolution, launcher, KVP publication, and live evidence unproven

## Safety question

Can session-0 evidence, a non-SYSTEM signer, wrong interactive process, replaced binary, malformed or duplicate JSON, modified post-sanitization content, stale payload, or oversized data obtain a valid guest-to-host scene signature?

## Implemented controls

- Only LocalSystem may enter the signing boundary.
- The relay policy separately binds exact Field generation, boot, agent, approved display, positive active interactive session, local interactive-user SID, fixed compiled agent path, and lowercase SHA-256 digest.
- Client facts require a positive PID and exact session/SID/path/digest match; digest comparison is fixed-time.
- The fixed producer path is `C:\Exosuit\Agent\Exosuit.Agent.exe`; arbitrary paths are rejected.
- Input is capped at 12 KiB and parsed with comments/trailing commas disabled, depth bounded, duplicate properties rejected recursively, case sensitivity enabled, and unknown members denied.
- The relay reruns the producer privacy/graph/freshness boundary using the approved display and requires canonical equality with the submitted payload.
- Only then may SYSTEM create a signed `scene_observation` envelope. Scene TTL is ten seconds.
- The interactive process never receives the channel secret through this API.

## Adversarial coverage

.NET tests cover successful exact signing and ten-second expiry; non-SYSTEM relay; wrong client session, user, path, and digest; wrong boot; duplicate/unknown JSON; altered private warning content; and payload overflow. Producer tests independently cover UI privacy, mode/provider/session/freshness, graph, cursor/modal, and resource bounds.

## Residual risk and promotion limit

`FieldSceneRelayClientFacts` are test inputs, not yet OS-derived facts. There is no pipe server, client-PID resolver, impersonated SID check, process-image hash acquisition, race-resistant executable verification, launcher, or KVP scene writer. The current v1 manifest session field identifies the LocalSystem bootstrap context and must not be reused. SCN-001 remains source-validated only.

## Rollback

Leave `FieldSceneRelayBoundary.AcceptAndSign` uncalled or remove the file/tests. The channel continues emitting only existing M1 records and no scene can be signed or published.
