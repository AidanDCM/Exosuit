# Level 4 atomic audit: scene producer configuration ACL

**Gate:** M2 / SCN-001  
**Decision:** source validation passed; live promotion denied

Generation 12 proved the service-created producer process ran as the intended unprivileged interactive user but crashed because the generated `scene-producer.json` inherited the SYSTEM/Administrators-only Config ACL. Repeated launches remained fail closed but generated a Windows Error Reporting storm and no scene.

The generated file now receives a protected ACL with exactly three principals: LocalSystem and Administrators with full control, and the exact approved interactive SID with read/execute only. The directory is not opened for enumeration, no secret or session-authoring file is exposed, and the producer still has no write, policy, signing, input, recording, or Field-administration authority. ACL failure occurs before launch. Fresh immutable-base and generation evidence is required before promotion.

Repository, plan, and Field-contract validation; typecheck; build; 263 Field tests; Field and system pulses; 875 full TypeScript tests; zero-warning Release .NET build; and 289 .NET tests passed. These establish source-level behavior only. SCN-001 remains unpromoted until a fresh immutable generation proves the automatic producer can read the file and deliver an authenticated structural scene without crash/retry churn.
