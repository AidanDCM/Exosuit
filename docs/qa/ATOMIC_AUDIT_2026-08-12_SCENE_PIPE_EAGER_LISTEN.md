# Level 4 atomic audit: scene pipe eager listen

**Gate:** M2 / SCN-001  
**Decision:** source validated; live promotion denied

The operation previously called “arm” allocated only the intake wrapper; Windows did not own the pipe name until the later accept call. G8 live evidence exposed the race after process launch was proven correct. The pipe stream is now created in the SYSTEM-only constructor, before the unprivileged producer exists.

Authority and ACLs are unchanged: exact generation and boot name, SYSTEM full control, exact interactive SID minimal write/connect rights, no read or ACL-management rights, and one server instance. No data category or cross-boundary path is added.

Creation failure prevents launch. Disposal closes the listener. Connection, framing, Windows-derived client identity, signing, replay, freshness, lock, Secure Desktop, heartbeat, and emergency-stop rules are unchanged. Focused tests do not substitute for a fresh-generation Windows proof.
