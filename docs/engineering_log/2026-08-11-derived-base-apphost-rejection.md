# Derived-base apphost rejection

- **Goal:** prevent a derived Field base from sealing a .NET apphost without the files it requires.
- **Master-plan phase / gate:** M2 preparation for SCN-001; no gate promotion. Corrected live guest acceptance remains required.
- **Subsystem ownership:** Field-owned base construction and guest startup packaging.
- **Files changed:** derived-base script, Windows static regression, Field runbook, threat model, failure matrix, Level 4 audit, and this log.
- **Identity/generation and policy impact:** no authority or policy expansion. Failed Field `4401b702-334f-475e-b867-b7d06798443d` generation 4 remains unverified and must be destroyed; its number is consumed. The next candidate must use a fresh generation and immutable base identity.
- **Parts & Pieces / donor patterns:** exact path scope, content-addressed components, fail-before-mutation validation, immutable-parent derivation, and exact-generation rollback.
- **Questions and assumptions:** a valid current Windows self-contained single-file agent is materially larger than the 16 MiB lower bound and has no same-stem runtime companions. Live LocalSystem startup remains the authoritative check.
- **Tests updated:** Windows Field script static test pins the bundle assertion, companion refusal, size floor, and receipt field.
- **Commands run before this change:** exact-head validation `20260811T214743Z` passed; v27 was derived and generation 4 provisioned; 61 host reads found no Exosuit handshake; guest SCM events 7000/7009 proved service timeout; guest inventory proved only the 151,552-byte apphost was present.
- **Results/evidence class:** live negative E5 evidence for packaging failure; source/static guard pending validation.
- **Assumptions/unvalidated:** corrected single-file base, service start, protected-secret transaction, authenticated handshake/bootstrap/heartbeats, and SCN scene path are not yet proven.
- **Security/privacy impact:** no secret, screenshot, UI text, or demonstration content was recorded. The change prevents a silent availability failure from being sealed into a base.
- **Rollback/disable path:** revert the guard and documentation only if the base format changes to copy and attest a complete bounded deployment manifest; never return to copying an unchecked apphost alone.
- **Next recommended slice:** validate and commit the guard, publish an exact single-file agent, destroy failed generation 4, remove unaccepted v27, derive the next base from v26, and provision a fresh generation.
