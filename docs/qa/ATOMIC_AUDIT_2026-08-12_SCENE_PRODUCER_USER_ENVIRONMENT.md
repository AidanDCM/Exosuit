# Level 4 atomic audit — scene producer user environment

**Verdict:** source/unit pass; fresh-generation live proof required

Generation 6 established that the authenticated relay, KVP publication, host reassembly, signature verification, exact generation/boot/session binding, structural privacy schema, and freshness checks work when the producer is launched visibly as the interactive user. The service-launched producer exited before connecting while `CreateProcessAsUser` was given a null environment, which means the child inherited the service environment rather than receiving one built for its user token.

The launcher now creates an environment block from the already verified primary user token and always destroys it. Every authority restriction remains: SYSTEM caller, exact active session, exact local SID, fixed executable path, on-disk digest recomputation, fixed producer mode/configuration, and `winsta0\\default`. The producer remains observe-only and holds no channel secret or signing authority.

No environment values are logged or persisted. Failures deny launch and cannot create readiness. SCN-001 remains unpromoted until a new immutable base and fresh generation prove automatic launch and the remaining ceremonies.

