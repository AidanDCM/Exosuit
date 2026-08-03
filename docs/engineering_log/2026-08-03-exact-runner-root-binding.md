# Engineering Log — Exact Runner Root Binding

**Date:** 2026-08-03

## Goal and gate

Make the documented `npm run build:exact` L0/L1 evidence command work under Windows
PowerShell 5.1 by passing the repository root explicitly.

## Ownership and authority impact

Shared build tooling only. The launcher starts the existing read-only/exact validation
runner with fixed PowerShell options, an absolute fixed script path, and the current
working directory as `RepositoryRoot`. It adds no Glove, Field, pilot, model, MCP,
recording, key, export, or lifecycle authority.

## Finding, tests, and evidence

Commit `e1a5150` passed the full pre-commit suite, but `npm run build:exact` failed
before its first validation step because `$PSScriptRoot` was empty while Windows
PowerShell 5.1 evaluated the script's default parameter expression. No validation or
system mutation occurred.

The package command now invokes a small Node launcher that uses `spawnSync` without a
shell and passes both the absolute runner path and absolute repository root as separate
arguments. Static tests bind the package command and required root argument. Exact-head
validation remains required after this change is committed.

## Security, privacy, assumptions, and rollback

The root is derived from the invoking working directory, matching the existing build
fabric contract. The runner retains all exact-head, evidence, and production-denial
behavior. No private content enters logs beyond the repository path already recorded
by the runner. Revert this slice to restore the prior package command; direct invocations
that explicitly pass `-RepositoryRoot` remain an alternative rollback path.

## Next slice

Run focused tests, commit, and rerun `npm run build:exact` against the resulting clean
head before reinstalling the Field Owner service.
