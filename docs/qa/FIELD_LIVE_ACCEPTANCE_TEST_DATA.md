# Field Live Acceptance Synthetic Data

Live acceptance must not begin with personal accounts or consequential targets.

## Approved synthetic application set

- Windows Notepad
- local static HTML fixture served inside the guest
- local fixture file tree under `C:\Field\Workspace\Fixture`
- generated images containing no personal data
- synthetic download files with known hashes
- a purpose-built test app with buttons, edit fields, list items, dialogs, progress, and deliberate failures

## Required synthetic workflows

1. Open Notepad, type a known phrase, save to Workspace, verify exact file hash.
2. Open local fixture site, search synthetic records, select one result, export a known JSON artifact.
3. Encounter and dismiss a synthetic modal.
4. Wait for a synthetic delayed control to become enabled.
5. Trigger a synthetic timeout with no external effect and prove one bounded retry.
6. Trigger a synthetic possible-unverified external effect and prove no retry.
7. Attempt stale scene, wrong window, wrong generation, expired policy, replayed channel message, and action-budget exhaustion.
8. Lock the guest and prove input denial.
9. Trigger a synthetic credential-marked field and prove observation/recording exclusion.
10. Emergency stop during pointer movement, typing sequence, wait, and artifact transfer.

## Prohibited acceptance data

- real banking, payroll, tax, health, or identity records;
- personal email or social accounts;
- real payment or purchase flows;
- production business systems;
- real credentials in test fields;
- third-party sites whose terms or security systems would be affected;
- host personal files;
- another Field generation's data.

## Fixture requirements

Every fixture must have:

- a repository-controlled version or generated manifest;
- expected state transitions;
- known artifact hashes;
- failure-injection controls;
- reset procedure;
- no network dependency unless the network slice is specifically under test;
- owner-readable success criteria.
