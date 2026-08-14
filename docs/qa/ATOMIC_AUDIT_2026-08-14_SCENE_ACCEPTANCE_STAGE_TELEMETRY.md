# Level 4 atomic audit: scene acceptance stage telemetry

**Gate:** M2 / SCN-001  
**Decision:** focused source validation passed; live promotion denied

Generation 18 proves scene acceptance can remain incomplete beyond the bounded clean-exit grace. The new diagnostic surface overwrites one local file with a timestamp and the latest fixed source-defined stage label. It records no scene payload, UI text, screenshot, path, identity value, digest, secret, or exception.

Stage recording is observational only and cannot influence acceptance, signing, publication, policy, consent, or execution. Existing exact identity, generation, boot, frame, timeout, and failure boundaries remain unchanged. Fresh immutable-generation evidence is required.

The Release build passed with warnings treated as errors. Focused pipe-server, Windows client-resolver, intake-service, and process-race tests passed 21/21. Repository, master-plan, and Field-contract validators and TypeScript typecheck passed.
