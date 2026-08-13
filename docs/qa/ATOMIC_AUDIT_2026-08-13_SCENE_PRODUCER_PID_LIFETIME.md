# Level 4 atomic audit: scene producer PID lifetime

**Gate:** M2 / SCN-001  
**Decision:** focused source validation passed; live promotion denied

Generation 15 established that the v38 producer crossed the pipe boundary and remained alive in the approved interactive session. The following one-use intake then had no launch PID because the ports discarded the `CreateProcessAsUser` result before the prior accept completed, while the supervisor correctly retained the producer as running.

The exact launch PID now remains bound across cycles for that supervised producer and is replaced only by a real launch. The relay still derives the connected PID from Windows and requires equality; session SID, executable path and digest, generation, boot identity, bounded frame, and one-way transport checks are unchanged. No process-name lookup or client-asserted identity is introduced. Fresh immutable-generation evidence is required.

The Release build passed with warnings treated as errors. Focused scene session, relay, and producer-client tests passed 39/39. Repository, master-plan, and Field-contract validators and TypeScript typecheck passed.
