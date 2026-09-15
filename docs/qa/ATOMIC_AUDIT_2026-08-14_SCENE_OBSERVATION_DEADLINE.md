# Atomic audit: scene observation deadline

- **Scope:** Field L4 observe-only scene producer before named-pipe transport.
- **Live trigger:** Generation 19 reached `pipe_waiting_for_client`; the guest service and authenticated heartbeat runtime remained healthy, no scene error was emitted, and no producer remained at inspection time.
- **Root cause addressed:** production observation requested descendant UI Automation elements through an API that materializes the full descendant tree before the configured element count is applied.
- **Authority:** unchanged. The producer remains an unprivileged exact-session observer with no signing secret, execution interface, policy authority, or recording authority.
- **Data boundary:** initial production collects top-level structural windows only. Screenshot capture stays disabled; downstream sanitization still removes UI text.
- **Deadline:** observation must complete within 30 seconds. Timeout terminates the one-shot producer path and is surfaced to the supervising SYSTEM runtime.
- **Unknown-effect rule:** no retry is added. A process that did not deliver a verified frame cannot advance scene state.
- **Identity and replay:** exact Field/generation/boot/session/SID/image/digest, authenticated KVP, expiration, sequence, nonce, and replay controls are unchanged.
- **Emergency stop and lifecycle:** unchanged; scene production remains opt-in and is cancelled with the guest runtime.
- **Not proven:** no accepted live scene yet; no UIA element snapshot, large-tree handling, lock/Secure Desktop invalidation, or promotion evidence is claimed.
- **Automated evidence:** Release build passed with zero warnings; focused producer/session tests passed 15/15; full Windows-agent tests passed 292/292; Field tests passed 263/263; Field system pulse passed 1/1; repository, plan, and Field validators plus TypeScript typecheck passed.
- **Rollback:** disable the scene-session file or revert this isolated slice and rebuild the disposable generation.
