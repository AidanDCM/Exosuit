# Pinning the bootstrap status across languages

- **Goal:** close the last guest-produced payload the host consumes without a cross-language
  fixture.
- **Files changed:** a generated fixture, C# and TypeScript contract tests, this log. **No source
  change** — `ReadBootstrapStatus` and `BindBootstrapToBoot` were already internal statics.

## The risk that motivated it

The mandatory bootstrap check list exists **twice**: a C# array in `FieldKvpRuntime` and a Zod
enum in `src/fieldBootstrap.ts`, maintained by hand in two languages.

Drift there is quiet in both directions. If the guest drops a check the host still requires, the
guest reports `ready` while the host waits forever for something nobody runs. If the guest adds a
name the host's enum does not know, the host rejects a report that is actually fine. Neither
fails loudly, and neither is visible without comparing the two lists directly.

They are identical today. That is now asserted rather than assumed.

## What is pinned

Generated from the guest's own functions across all three readiness outcomes — all checks pass,
one check missing, one check failed.

- **C#:** the fixture records the *live* mandatory list and a test compares it against the field
  by reflection, so changing the C# list makes the fixture stale and fails immediately rather than
  drifting silently. Every case verifies as a signed bootstrap status; readiness is derived from
  the report rather than asserted; every status is bound to the boot.
- **TypeScript:** the guest's list is compared against `fieldBootstrapCheckNameSchema.options`
  exactly and in order; every emitted check name parses under the host enum; every envelope
  verifies; the **embedded report** parses under `fieldBootstrapReportSchema`.

That last one matters more than it looks. The guest embeds the whole report, not just its own
summary. If the host could not parse it, the host could only ever take the guest's `status` on
trust — which would make the summary unfalsifiable, and a guest that lied about its own readiness
undetectable.

Two further assertions worth naming: a **missing** check stays distinct from a **failed** one, so
a host can tell "not finished yet" from "this Field is wrong"; and every payload is checked for
characters that would canonicalise differently across languages, which is the test the scene
defect needed and did not have.

## Results

- Agent suite **259/259**; TypeScript **825/825** across 109 files.
- `validate:repository`, `validate:field-contract`, `validate:completion` all pass.
- Gate unchanged: CHN-001 `passed`, SCN-001 `source_validated`.

## Where the cross-language surface stands

Every guest-produced payload the host consumes now has a fixture generated from the guest's own
code and asserted on both sides: channel envelope, KVP chunk format, scene observation, heartbeat,
bootstrap status.

Four of those five found nothing. The scene fixture found two real defects on the day it was
written, one of which would have failed every scene of a live SCN-001 session. The value was not
evenly distributed and there was no way to know in advance which one would carry it.
