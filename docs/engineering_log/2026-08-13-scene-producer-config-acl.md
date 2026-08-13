# Scene producer configuration ACL

- Goal: allow the exact authorized unprivileged scene producer to read only its structural producer configuration.
- Master-plan phase and gate: M2 / SCN-001; no promotion is claimed.
- Subsystem ownership: Field guest runtime only; Glove authority is unchanged.
- Live evidence: generation 12 produced repeated .NET `UnauthorizedAccessException` crashes at `FieldSceneProducerConfiguration.Read` for `C:\Exosuit\Config\scene-producer.json`. The Config directory correctly excludes ordinary users, but the generated producer file inherited that exclusion.
- Files changed: Field scene session ports, ACL tests, Level 4 audit, failure matrix, and this log.
- Identity/generation/policy impact: the ACL names the exact `InteractiveUserSid` already approved in the session and checked again at launch and relay. It grants read/execute only. SYSTEM and Administrators retain full control. No pilot policy authority is added.
- Parts & Pieces and donor patterns: reused the protected-secret file policy's explicit protected ACL pattern, but added the one exact producer SID with read-only rights; secret ACLs remain unchanged.
- Questions and assumptions: Windows traverse checking permits access to the explicitly named file without granting directory enumeration. Fresh-generation live evidence must prove this on the guest.
- Tests: local Windows ACL test pins protected inheritance, exactly three allow rules, and absence of write/delete/change-permissions rights for the producer. Repository, plan, and Field-contract validators passed; typecheck and build passed; Field tests passed (263), Field and system pulses passed, the full TypeScript suite passed (875), Release .NET build passed with zero warnings/errors, and .NET tests passed (289).
- Commands actually run: the mandatory npm validation/typecheck/test/build/pulse commands and Release `dotnet restore`, `dotnet build --no-restore -warnaserror`, and `dotnet test --no-build` commands from `AGENTS.md`.
- Results and evidence class: source/static and automated local-Windows evidence passed. Generation 12 is diagnostic evidence for the denial and WER storm only; it is not evidence that the fix works live.
- Assumptions and unvalidated areas: a fresh immutable base and Field generation must still prove automatic unprivileged producer launch, configuration read, authenticated scene acceptance, and absence of a crash loop.
- Security/privacy: the file contains exact Field/boot/session/display configuration but no channel secret, UI text, screenshot, scene, recording, or input data. No other Config file becomes readable.
- Failure behavior: ACL application occurs before launch. Failure prevents producer creation; identity, pipe, signature, and readiness remain fail closed.
- Storage/rollback: immutable guest-base source only; rebuild and increment Field generation. Revert this slice to restore the prior denial.
- Next recommended slice: deploy a fresh base/generation and prove automatic structural scene publication without a manual producer.
