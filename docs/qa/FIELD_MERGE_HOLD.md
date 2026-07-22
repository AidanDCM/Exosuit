# Field Merge Hold

The Field PR must remain draft and unmerged while any of these are true:

- current-head TypeScript/.NET/PowerShell validation has not executed;
- a compiler, test, parser, or repository-validator failure is unresolved;
- the final source audit is not updated with executable evidence;
- the PR describes live capability not supported by evidence;
- source changes are wired into the live Glove runtime before validation;
- reviewer questions about authority, base-image integrity, replay, privacy, path scope, recovery, or emergency stop remain unresolved.

Passing L0 allows review for merge into the Glove build branch only. It does not enable a live Field.
