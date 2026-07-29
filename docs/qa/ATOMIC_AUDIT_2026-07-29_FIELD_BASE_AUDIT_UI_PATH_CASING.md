# Atomic audit: Field base Audit UI path casing

- Date: 2026-07-29
- Scope: canonical Sysprep executable identity comparison only
- Verdict: source validation passed; live recovery attempt pending

## Preserved boundary

The change does not broaden executable identity. Both paths are normalized with `System.IO.Path.GetFullPath` and compared with `StringComparison.OrdinalIgnoreCase`, which reflects Windows path casing semantics. The existing exact process cardinality and Audit UI command-line requirements remain unchanged.

## Live evidence basis

Attempt 4 completed SYSTEM maintenance but the Audit seal rejected the sole automatic Sysprep UI process. Preserved Panther and process evidence identified the canonical executable and `/reboot` invocation; the only mismatch was path letter casing. This audit does not treat that failed attempt as passing evidence.

## Required proof

1. Focused Windows Field script contract test — passed, 8/8.
2. Full repository validation, including the explicit SDK-backed .NET suite — passed, 314/314 TypeScript and 48/48 .NET tests plus both system pulses.
3. Exact-head publication — pending commit.
4. A fresh recovery-scoped v19 attempt that produces both maintenance and Audit seal receipts, canonical shutdown, offline verification, and promotion before the result can be marked live-passed — pending.
