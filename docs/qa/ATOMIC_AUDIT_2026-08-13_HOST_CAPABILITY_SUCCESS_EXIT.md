# Level 4 atomic audit: host capability success exit

**Gate:** M2 / SCN-001 provisioning support  
**Decision:** source validated; live promotion denied

The host capability script already computed a deny-by-default structured contract and exited 2 when any required fact was false. It did not explicitly exit zero when every fact was true, so provisioning could consume stale `$LASTEXITCODE` from an earlier command and falsely deny a valid current result.

The script now exits zero only after emitting a contract whose `ready` value passed. Failure remains exit 2. No check is removed, weakened, or defaulted true; no VM mutation occurs in the checker; and no Field, policy, recording, channel, or pilot authority changes. Fresh exact-commit preparation and live provisioning evidence remain required.

Validation passed: live stale-exit regression (37 became 0 after a ready check), repository/plan/Field-contract validators, typecheck and build, 51 Field files / 263 tests, 112 complete TypeScript files / 875 tests, Field and system pulses, warning-free Release .NET build, and 288/288 Windows-agent tests.
