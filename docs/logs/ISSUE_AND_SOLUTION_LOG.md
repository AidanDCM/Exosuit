# Issue and Solution Log

Use one dated entry per verified issue. Add a regression test before marking an execution or safety issue solved.

## 2026-07-17 — Initial protocol mismatch found during static review

**Symptom:** The first .NET contract draft would have serialized enums as PascalCase and represented pointer coordinates as a rectangle, while TypeScript expected snake_case enums and `{x, y}`.

**Cause:** Language-default serialization assumptions were not aligned before compilation.

**Solution:** Configure .NET JSON globally with `JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseLower)`, remove enum-level converters, and introduce a separate `Point` record.

**Regression protection:** `.NET` test `WireEnumsUseSnakeCase`; shared `wire-contract-v1.json` consumed by TypeScript and .NET.

**Evidence:** TypeScript fixture test passes in reconstructed-container validation; .NET execution remains pending Windows CI.

**Status:** Review until .NET test evidence is green.

## 2026-07-17 — Repository contract rejected a fake credential-shaped literal

**Symptom:** The first repository-contract job failed.

**Reproduction:** Scan non-Markdown source for long `sk-...` or bearer-token-shaped strings.

**Cause:** A TypeScript redaction test committed a literal fake token shape long enough to match the source scanner.

**Impact:** CI correctly refused the repository even though the value was synthetic.

**Solution:** Construct the token-shaped fixture at runtime so source control contains no credential-shaped literal.

**Regression test:** Existing redaction test still proves inline token redaction; repository-contract scan remains mandatory.

**Evidence:** Static source review confirms the literal was removed. Current-head GitHub repository-contract evidence is pending.

**Status:** Review pending current-head GitHub Actions.

## 2026-07-17 — MCP structured output used a non-indexable interface

**Symptom:** Initial TypeScript typecheck failed; static review identified a named interface returned directly as MCP `structuredContent`.

**Cause:** Named interfaces do not automatically satisfy the MCP SDK's indexable structured-content constraint.

**Impact:** The MCP gateway could not be considered buildable.

**Solution:** Change `ElementSearchResult` to a type alias.

**Regression test:** Strict TypeScript build includes the exact MCP server registration and element-search response.

**Evidence:** Reconstructed-container strict typecheck and production build both exit 0.

**Status:** Closed for container evidence; GitHub Actions confirmation pending.

## 2026-07-17 — Audit canonicalizer had an undefined return edge

**Symptom:** Strict static review found `JSON.stringify` could return `undefined` while `stable()` promised `string`.

**Cause:** Canonical hashing assumed all primitive JSON serialization returned text.

**Impact:** Typecheck failure and ambiguous event hashing for undefined values.

**Solution:** Assign an explicit deterministic representation to undefined and a string fallback for other non-JSON primitives.

**Regression test:** Audit redaction/hash-chain tests and strict TypeScript typecheck.

**Evidence:** Reconstructed-container TypeScript suite passes.

**Status:** Closed for TypeScript evidence.

## 2026-07-17 — Fake-agent test verified the wrong element ID

**Symptom:** Full reconstructed TypeScript suite produced 20 passes and one failed fake-agent verification test.

**Reproduction:** Execute a value-set proposal against `el-editor` while the inherited expectation still targets `el-1`.

**Cause:** The test overrode the target element but not the verification expectation.

**Impact:** False negative obscured the actual fake-agent behavior.

**Solution:** Bind the expectation to `el-editor` in the test case.

**Regression test:** `fake agent executes and verifies a semantic sandbox action`.

**Evidence:** Full reconstructed suite now reports 3 files passed and 21 tests passed; isolated system pulse also passes.

**Status:** Closed.

## 2026-07-17 — Windows UI Automation assemblies were implicit

**Symptom:** The first Windows build job failed and the project used `System.Windows.Automation` without explicit assembly references.

**Cause:** The project assumed WPF targeting would always provide the required UI Automation references.

**Impact:** Hosted Windows compilation was unreliable.

**Solution:** Add explicit `UIAutomationClient` and `UIAutomationTypes` references and remove unused Windows Forms configuration.

**Regression test:** Windows-targeted build with warnings as errors and xUnit suite.

**Evidence:** Current-head Windows CI remains pending.

**Status:** Review.

## 2026-07-17 — Current-head Actions runs are not connector-visible

**Symptom:** New validation branches and draft PRs have not returned pull-request workflow runs through the connector-visible run query.

**Cause:** Not yet proven; possibilities include GitHub event suppression for app-authored changes, queue delay, or repository workflow configuration outside the branch contents.

**Impact:** Current GitHub-hosted evidence cannot yet be claimed despite local TypeScript validation.

**Solution:** Preserve diagnostic artifacts in CI, keep canonical PR draft, use isolated validation PRs, and continue polling/trigger analysis without merging unvalidated code.

**Regression test:** A current-head PR run must expose TypeScript, Windows, repository-contract, and CodeQL outcomes.

**Evidence:** Historical run `29615724253` exists for the initial head; current-head runs were absent when checked.

**Status:** Open.

## Template

### YYYY-MM-DD — Issue title

**Symptom:**  
**Reproduction:**  
**Cause:**  
**Impact:**  
**Solution:**  
**Regression test:**  
**Evidence:**  
**Status:** Open / Review / Closed
