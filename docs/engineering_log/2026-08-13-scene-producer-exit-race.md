# Scene producer exit/intake race

- Goal: turn a launched producer that exits before delivering its one frame into a bounded, observable, fail-closed scene-cycle failure.
- Master-plan phase and gate: M2 / SCN-001. No promotion is claimed.
- Subsystem ownership: Field guest runtime only; Glove authority is unchanged.
- Live evidence: generation 11's manually elevated v34 producer delivered a digest-valid six-chunk `scene_observation` for the exact Field generation and exited cleanly after 11.35 seconds. The automatically launched unprivileged producer disappeared without connecting, while SYSTEM waited indefinitely on the armed intake and wrote no failure reason.
- Files changed: `apps/windows-agent/FieldSceneSession.cs`, its .NET tests, the Level 4 audit, and the Field failure-injection matrix.
- Identity/generation and policy impact: the service tracks only the exact PID returned by `CreateProcessAsUser`. No identity assertion is accepted from the producer and no policy expands. A fresh immutable base and Field generation are required.
- Parts & Pieces and donor patterns: the existing exact-process supervisor pattern and one-use relay intake were retained; no donor code was imported.
- Questions and assumptions: the producer's early exit cause remains intentionally unresolved until the next live generation reports its exit code. A successful frame must beat process exit while the 10-second identity hold keeps that process resolvable.
- Tests: focused process-race tests cover frame-first success and exit-first cancellation/failure. Repository, plan and Field-contract validation, typecheck/build, 51 Field files / 263 tests, both pulses, 112 complete TypeScript files / 875 tests, warning-free Release .NET build, and 288/288 Windows-agent tests passed.
- Security/privacy: the new failure contains only a numeric process exit code. It stores no scene bytes, UI text, screenshot, secret, token, signature, or recording data.
- Failure behavior: exact-producer exit cancels the one-use accept, records the existing bounded scene failure, invalidates readiness, and does not retry an uncertain effect.
- Storage boundaries: immutable-base source only; no personal-state or task-disk behavior changes, and no host/other-Field data path is added.
- Session lock, Secure Desktop, heartbeat loss, replay, overflow, uncertain effect, and emergency stop retain their existing fail-closed behavior.
- Rollback: revert this slice and rebuild a new immutable base; existing generations remain generation-bound and are destroyed rather than mutated.
- Next recommended slice: deploy a fresh generation, capture the automatic producer exit reason, then fix only the identified unprivileged observation/launch failure.
