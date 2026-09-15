# Atomic audit: Field v21 compiled KVP canary

## Verdict

PASS for the bounded development-access compiled-ledger canary. Production,
execution, recording, and promotion remain DENIED.

## Exact identity

- Source commit: `454fc852dc58802b0c13aa3a1245a05407bff4eb`
- Agent SHA-256: `c9cf91e1709ec651a9b17d926c6f01e13f31f2df4ea75ff4b04c208133ebba40`
- Base: `exosuit-field-base-v21`
- Base SHA-256: `e74c7fe500e56b3f925cdc4d9549fd7adf82b477a0ac4a4b2bb819b3374d7265`
- Field: `6834d5ff-3b29-4dcb-b405-73f5227ea63f`
- Generation: 1
- VM: `Exosuit-Field-6834d5ff-3b29-4dcb-b405-73f5227ea63f-G1`

## Evidence proved separately

- Base construction and sealing: detached SYSTEM maintenance, built-in Audit
  administrator, canonical Sysprep, no non-built-in account, runtime service
  Manual until SetupComplete, exact agent digest, read-only promotion.
- Provisioning: exact preview, isolated switch, immutable parent, disposable OS
  overlay and task disk, Secure Boot and TPM, development access explicit.
- Restart: graceful shutdown without force, clean new boot identity, durable
  enrollment accepted after manifest expiry, authenticated ready state.
- Repeated observation: exact retained handshake/bootstrap accepted; heartbeat
  and compiled ledger advanced strictly.
- Negative transition: payload tamper, valid equal sequence, and valid reused
  message ID rejected; ledger bytes unchanged after every rejection.
- Destruction: exact VM and generation root removed; immutable base digest and
  read-only attribute unchanged.

## Findings and repairs

1. Windows PowerShell 5.1 kept the verifier JSON array nested inside `@(...)`.
   The adapter now uses `[object[]]`, requires exactly three results, and has a
   native Windows PowerShell regression test.
2. This Hyper-V module does not expose `Stop-VM -Shutdown`; the supported
   default graceful stop with `-Confirm:$false` was used without `-Force` or
   `-TurnOff`.
3. `Start-VM` reported insufficient RAM but later reconciled to Running. No
   blind retry occurred; state was observed first, and the next resume refused
   because the VM was already Running.
4. One cold verifier start outlived a ten-second heartbeat envelope. The ledger
   remained unchanged, and bounded fresh retries later passed without extending
   TTL or weakening freshness.

## Privacy, authority, and held gates

No input, scene capture, screenshot, Teach event, recording, artifact transfer,
or Pilot command occurred. Policy remained Shadow observation only. No secret
value is present in committed evidence.

Still held: production key storage/rotation, stale-generation replacement,
protected-state corruption, lock/Secure Desktop, deliberate heartbeat loss,
pause/resume, network packet isolation, physical stop, input, recording,
artifact transfer, Shadow process proof, Pilot, packaging, and production.
