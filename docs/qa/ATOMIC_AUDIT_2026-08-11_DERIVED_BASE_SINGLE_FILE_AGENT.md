# Level 4 Addendum: Derived-base standalone agent

**Date:** 2026-08-11

**Verdict:** source/static guard added after live v27 startup failure; corrected base and guest acceptance remain pending

## Failure observed

The v27 derivation received a 151,552-byte .NET apphost from a multi-file self-contained publish. The derivation copied only `Exosuit.Agent.exe`. Inside the disposable generation, Service Control Manager installed `ExosuitFieldGuest` correctly but timed out because `Exosuit.Agent.dll` and runtime companions were absent. No Exosuit KVP handshake was published.

## Control

`New-ExosuitDerivedFieldBase.ps1` now refuses an agent smaller than 16 MiB or an input directory containing same-stem `.dll`, `.deps.json`, or `.runtimeconfig.json` companions. The check runs before the temporary base copy is created or mounted. Plans and receipts state the standalone-bundle requirement and successful verification.

This is a structural packaging guard, not proof that the executable starts as LocalSystem. Disposable guest service startup and authenticated channel evidence remain required.

## Rollback

Destroy the exact failed generation, verify v27 has no remaining overlays, remove unaccepted v27, and derive the next candidate directly from accepted read-only v26 using an exact single-file publish.
