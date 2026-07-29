# Level 4 audit — Field base consumed-secret canonicalization

## Scope

Canonical verification of the one-use v19 Audit-mode answer file after Windows Setup consumes credential elements.

## Evidence

Attempt 2 authenticated PowerShell Direct as SID `-500`, launched the LocalSystem maintenance service, and reached `authorization_verified`. The SYSTEM child then rejected the answer-file contract. Read-only offline inspection recorded:

- passes: `auditSystem`, `oobeSystem`;
- components: `Microsoft-Windows-Shell-Setup`, `Microsoft-Windows-Deployment`;
- no `RunSynchronous` or `RunSynchronousCommand`;
- two `wasPassProcessed` attributes;
- zero remaining password value nodes;
- the XML comment marker was absent.

No password text or answer-file copy was collected.

## Security invariants

- The host owns the one-use credential and does not log it.
- SYSTEM remains the maintenance principal; SID `-500` remains the seal principal.
- Canonicalization excludes only comments, `wasPassProcessed`, `Password`, and `AdministratorPassword`.
- All remaining non-secret XML structure stays authorization-bound.
- `RunSynchronous` remains forbidden.
- No target is promoted without both digest-bound receipts and exact Sysprep shutdown.

## Verdict

Source correction prepared. Live v19 proof remains pending and must not be inferred from this audit.
