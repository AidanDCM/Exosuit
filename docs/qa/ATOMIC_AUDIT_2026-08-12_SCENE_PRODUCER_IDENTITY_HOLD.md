# Level 4 atomic audit: scene producer identity hold

**Gate:** M2 / SCN-001  
**Decision:** source validated; live promotion denied

G10 proved that a valid short-lived producer can exit while SYSTEM hashes its 188 MB pinned executable, causing the existing stable-identity check to reject the frame. The producer now remains alive for a fixed 10-second post-send interval in production.

This does not replace, weaken, or bypass Windows-derived identity. The relay still resolves the pipe client PID, session, token SID, executable path and digest, and still requires the process to be alive after hashing. The client supplies none of those facts. The pipe remains one-way, one-connection, one-frame, exact-generation and exact-boot.

The hold is bounded, cancellation-aware, content-free, and adds no retry. Fresh-generation Windows evidence is required before any SCN-001 promotion.
