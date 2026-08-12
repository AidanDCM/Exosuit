# Level 4 atomic audit: single-shot scene producer

**Gate:** M2 / SCN-001  
**Decision:** source validated; live promotion denied

The relay authorizes one connection carrying one bounded frame. A producer loop was incompatible with that budget: after a successful first delivery it attempted a second connection and timed out. The producer now performs exactly one observe/sanitize/send transaction and exits.

Cadence remains Field-owned by the SYSTEM supervisor, which must arm a fresh exact-generation and exact-boot listener before each launch. The producer gains no retry, signing, policy, read, input, recording, or execution authority. A possibly delivered frame is never retried by that process.

No UI text or screenshot is retained; the existing sanitization boundary is unchanged. Focused tests prove single-shot behavior but cannot prove live freshness, identity, or Windows scheduling. A fresh-generation authenticated scene and remaining SCN-001 ceremonies are still required.
