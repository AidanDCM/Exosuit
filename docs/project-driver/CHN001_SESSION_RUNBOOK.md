# CHN-001 session runbook

## Purpose and boundary

CHN-001 proves the authenticated Hyper-V KVP channel, readiness invalidation,
and emergency stop on one exact production-configured disposable Field. It does
not prove scenes, actions, Teach quality, Shadow, Pilot, MCP, or production.

The canonical machine-checkable run schema is `src/completion/chn001.ts`. A run
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
  stop, degraded stop, and recording-stop ceremonies.

## Required live matrix

Every row CHN-001.1 through CHN-001.12 in
`docs/qa/BUILD_COMPLETION_TEST_MATRIX.md` is mandatory. In particular:

- at least one verified handshake and bootstrap plus three verified heartbeats;
- mutation, message-ID replay, nonce replay, durable sequence rollback, wrong
  direction/key/generation, and boot-ID replacement rejection;
- real heartbeat degradation/fault;
- real guest lock, Secure Desktop, and display mismatch observations;
- healthy-channel, degraded-channel, and active-recording emergency stops;
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

The acquisition runner remains the next implementation slice. Until it emits a
`chn001RunSchema` document with zero validation failures, CHN-001 stays
`source_validated` and no promotion command is permitted.

## Rollback

Destroy only the exact disposable Field generation through
`Remove-ExosuitFieldGeneration.ps1`, revoke its generation-specific secret, and
verify the VM, generation root, overlay, and task disk are absent. Never edit a
signed ledger event; append a revocation if accepted evidence is later invalid.
