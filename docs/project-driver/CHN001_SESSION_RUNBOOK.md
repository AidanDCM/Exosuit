# CHN-001 session runbook

## Purpose and boundary

CHN-001 proves the authenticated Hyper-V KVP channel, readiness invalidation,
and emergency stop on one exact production-configured disposable Field. It does
not prove scenes, actions, Teach quality, Shadow, Pilot, MCP, or production.

The canonical machine-checkable run schema is `src/completion/chn001.ts` (contract
version 2). A run
cannot pass by combining source tests with prose or by relabeling development
access as production evidence.

## Entry conditions

- HYP-001 is proven.
- Worktree and exact harness commit are clean.
- Secure Boot, TPM-sealed completion keys, private Hyper-V switch, immutable
  base v25 digest, and memory preflight pass.
- The plan contains no `developmentAccess` and no personal state.
- The seed secret is generation-specific, protected outside the repository,
  and never copied into logs or committed artifacts.
- The guest agent and host verifier are built from the reviewed commit.
- A local owner can perform the visible lock, Secure Desktop, display, healthy
  stop and degraded-stop ceremonies.

## Required live matrix

Every row CHN-001.1 through CHN-001.11 in
`docs/qa/BUILD_COMPLETION_TEST_MATRIX.md` is mandatory. In particular:

- at least one verified handshake and bootstrap plus three verified heartbeats;
- mutation, message-ID replay, nonce replay, durable sequence rollback, wrong
  direction/key/generation, and boot-ID replacement rejection;
- real heartbeat degradation/fault;
- real guest lock, Secure Desktop, and display mismatch observations;
- healthy-channel and degraded-channel host emergency stops;
- exact-generation destruction and unchanged immutable-base digest.

Captured real envelopes may be mutated offline for CHN-001.1–.4, but the source
envelope must come from the live generation. CHN-001.7–.9 cannot be satisfied by
manufacturing a signed payload on the host.

## Stop conditions

Stop without recording completion evidence if any mandatory injection is
missing, the guest or host identity changes, an accepted sequence repeats, the
boot ID changes without invalidation, the source tree changes, a stop exceeds
five seconds, cleanup is uncertain, or the base digest changes.

Emergency-stop failure is release-blocking. Do not automate recovery from that
failure. Preserve sanitized diagnostics and require owner review.

## Current executable source checks

```powershell
npm run test:chn001 -- --reporter=verbose
npm run test:field -- --reporter=verbose
dotnet test apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --configuration Release
```

## Acquisition driver

The driver is intentionally split from Field/Glove authorities. It cannot create or
destroy a VM, alter the guest, lock or unlock a session, invoke Secure Desktop, change
the display, inject input, record, or stop execution. It binds a clean exact commit,
validates the production plan/runtime/base/VM, captures compiled authenticated KVP
snapshots, content-addresses ceremony artifacts, and refuses incomplete finalization.

```powershell
npm run chn001:harness -- plan --config C:\path\to\chn001-config.json
npm run chn001:harness -- start --config C:\path\to\chn001-config.json --confirm "START CHN-001 EVIDENCE SESSION"
npm run chn001:harness -- capture --run-id <run-id> # repeat for >=3 distinct heartbeats
npm run chn001:harness -- add-injection --run-id <run-id> --id CHN-001.1 --artifact C:\path\to\typed-injection-artifact.json
npm run chn001:harness -- add-stop --run-id <run-id> --scenario healthy --artifact C:\path\to\typed-stop-artifact.json
npm run chn001:harness -- finalize --run-id <run-id>
```

Repeat `add-injection` for all 11 IDs and `add-stop` for healthy and degraded.
`CHN-001.12` is retired; active-execution stop is owned by `ACT-001.23` and
active-recording stop by `TCH-001.12`. Finalize independently verifies the VM and exact generation root are absent
and rehashes the immutable base. It writes a candidate only; it does not record
completion evidence or promote the gate.

Injection and stop artifacts are strict, closed-schema documents. Each binds the exact
commit, machine, Field/generation, VM GUID, evidence mode/scenario, outcome and timing,
plus the SHA-256 of its underlying raw observation. Unknown fields and cross-bound
artifacts are rejected.

The configuration must bind the exact VM name/GUID, Field/generation, v26-or-later
base image and digest, production provisioning plan, host config, protected guest
runtime config, channel key ID, and reviewed agent executable. All production flags
are literal deny-by-default values. The driver also parses the plan and runtime files;
the flags cannot override development access or a mismatched identity.

Until the driver emits a `chn001RunSchema` document with zero validation failures and
an independent reviewer authorizes it, CHN-001 stays `source_validated` and no
promotion command is permitted. v25 cannot satisfy the updated bootstrap boot-binding
contract; rebuild and acceptance of a new immutable base are required first.

### Phase-correct v1 session migration

A v1 acquisition that already collected CHN-001.1-.11 plus healthy/degraded stops may
be evaluated under v2 without relabeling its evidence. Finalize requires the exact typed
phrase `MIGRATE CHN-001 V1 SESSION TO PHASE-CORRECT V2`, proves the evidence commit is
an ancestor of the evaluation commit, and rejects any intervening runtime, provider,
Field script, policy, key, or transport change. The candidate preserves the original
evidence commit, records the evaluation commit, sorted changed-file list, and its digest.
This migration cannot invent `.12`, recording, execution, or promotion evidence.

## Rollback

Destroy only the exact disposable Field generation through
`Remove-ExosuitFieldGeneration.ps1`, revoke its generation-specific secret, and
verify the VM, generation root, overlay, and task disk are absent. Never edit a
signed ledger event; append a revocation if accepted evidence is later invalid.
