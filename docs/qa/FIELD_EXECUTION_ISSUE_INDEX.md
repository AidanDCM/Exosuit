# Field and Production Execution Issue Index

This file maps live execution gates and cross-cutting production blockers to GitHub issues. Source foundations are not promotion evidence.

## Ordered live gates

| Gate | Issue | Purpose |
|---|---:|---|
| L0 | [#12](https://github.com/AidanDCM/Exosuit/issues/12) | Execute exact-head repository, master-plan, TypeScript, PowerShell, .NET, dependency, and host-capability validation |
| L1 | [#13](https://github.com/AidanDCM/Exosuit/issues/13) | Prove synthetic Hyper-V generation lifecycle, rollback, and base-image preservation |
| L2 | [#14](https://github.com/AidanDCM/Exosuit/issues/14) | Integrate authenticated host/guest transport, replay persistence, heartbeat, shutdown, and emergency stop |
| L3 | [#15](https://github.com/AidanDCM/Exosuit/issues/15) | Wire guest bootstrap, display/session readiness, attestation, and generation replacement |
| L4/L5 | [#16](https://github.com/AidanDCM/Exosuit/issues/16) | Implement live scene production and consented Teach recording with privacy/deletion evidence |
| L6 | [#17](https://github.com/AidanDCM/Exosuit/issues/17) | Implement live bounded cross-VM artifact transfer and quarantine/export review |
| L7/L8 | [#18](https://github.com/AidanDCM/Exosuit/issues/18) | Implement retrieval and Shadow prediction while preserving process-level no-input authority |
| L13 synthetic Pilot | [#19](https://github.com/AidanDCM/Exosuit/issues/19) | Prove one synthetic Pilot workflow with verification, recovery, audit, and physical emergency stop |

The complete L0–L20 program remains authoritative in `docs/MASTER_SYSTEM_ROADMAP.md`. Later phases require additional bounded issues when their dependencies are close to completion; absence of an issue does not waive a phase.

## Cross-cutting release blockers

| Blocker | Issue | Release effect |
|---|---:|---|
| mutable personal-state identity conflicts with whole-file digest | [#20](https://github.com/AidanDCM/Exosuit/issues/20) | blocks persistent personal-state and Hyper-V promotion |
| no executable CI evidence and no reproducible Node lockfile | [#21](https://github.com/AidanDCM/Exosuit/issues/21) | blocks PR merge and all production claims |
| replay persistence, .NET memory bounds, and canonical channel timestamps | [#22](https://github.com/AidanDCM/Exosuit/issues/22) | blocks live authenticated transport |
| canonical origin and executable process identity | [#23](https://github.com/AidanDCM/Exosuit/issues/23) | blocks real website/account Pilot acceptance |

## Evidence rule

No issue completion proves another gate unless the required artifacts are explicitly attached and cited. Work should proceed in dependency order. A source-only change may be developed ahead of a gate, but it cannot claim promotion evidence.