# Level 4 atomic audit — scene runtime failure diagnostic

**Verdict:** focused source/unit pass; live scene runtime remains unpromoted

Generation 5 proved authenticated bootstrap and heartbeat and carried one manually launched structural scene across Hyper-V. The scene expired before host acceptance and therefore was correctly rejected. Subsequent producer execution timed out because no privileged intake listener was available. The prior runtime retained its exact launch/intake/publication reason only in volatile supervisor state.

This slice writes the latest failure to the fixed guest path `C:\Exosuit\Logs\scene-runtime-error.log`. The file is overwritten, bounded to 1,000 characters, and receives only the stage-prefixed exception reason. No scene bytes, UI text, screenshots, secrets, signatures, tokens, or recording data are written. The producer remains unprivileged and observe-only; the pilot gains no Field administration or policy authority.

Expected failures continue to invalidate readiness. Publication uncertainty is not retried in place. SCN-001 remains `source_validated` until a fresh authenticated scene is accepted live and the required ceremonies pass.

