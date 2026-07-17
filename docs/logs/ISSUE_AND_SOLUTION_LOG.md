# Issue and Solution Log

Use one dated entry per verified issue. Add a regression test before marking an execution or safety issue solved.

## 2026-07-17 — Initial protocol mismatch found during static review

**Symptom:** The first .NET contract draft would have serialized enums as PascalCase and represented pointer coordinates as a rectangle, while TypeScript expected snake_case enums and `{x, y}`.

**Cause:** Language-default serialization assumptions were not aligned before compilation.

**Solution:** Configure .NET JSON globally with `JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseLower)`, remove enum-level converters, and introduce a separate `Point` record.

**Regression protection:** `.NET` test `WireEnumsUseSnakeCase`; TypeScript contract bounds.

**Status:** Code corrected; automated tests not yet run.

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
