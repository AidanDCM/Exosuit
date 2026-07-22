# Field Next Responsible Action

Run the exact branch head through:

```powershell
./scripts/windows/Invoke-ExosuitFieldValidation.ps1
```

Do not add more runtime authority before that command completes and its failures are repaired.

After a clean L0 result, perform only L1: one synthetic, isolated, disposable Hyper-V Field generation using `docs/FIELD_WINDOWS_RUNBOOK.md` and `tests/fixtures/field-pilot-fixture.html`.
