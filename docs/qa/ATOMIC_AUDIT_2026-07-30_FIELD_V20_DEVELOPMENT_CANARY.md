# Atomic audit: Field v20 development canary

## Verdict

PASS for the bounded development-access canary. Production, execution,
recording, and promotion remain DENIED.

## Exact identity

- Source commit: `2735a85dae2d9ca97cb6e16a26ce5cf7e4cced2e`
- Base: `exosuit-field-base-v20`
- Base digest: `452790e549cc31f3d4bb2613113f5a386716447d9b4795ded2a9193ad415547d`
- Field: `7fad0376-68aa-4300-899d-a2ded6e1fb15`
- Generation: 1
- VM: `Exosuit-Field-7fad0376-68aa-4300-899d-a2ded6e1fb15-G1`

## Proven separately

- Isolation plan: isolated switch, no LAN/inbound origins, clipboard/drive
  mapping/host injection false, artifact broker only.
- Base sealing: SYSTEM maintenance, detached network, no non-built-in accounts,
  service `ManualUntilSetupComplete`, canonical Audit-mode Sysprep.
- Provisioning: immutable parent plus disposable differencing overlay and
  separate disposable task disk; Secure Boot and TPM requested and applied.
- Readiness: authenticated handshake/bootstrap/heartbeat bound to exact Field,
  generation, agent, base digest, task disk, display, manifest, and policy.
- Destruction: exact typed-confirmation removal deleted only the canary VM
  registration and disposable generation root; the v20 parent remained
  read-only with the exact promoted digest.
- Prediction/execution/recording: not exercised and not inferred from readiness.

## Replay observation finding

The original host reader persisted command-style replay state across polls and
therefore rejected a retained KVP handshake on the second observation. The
corrected reader authenticates every snapshot with fresh bounded replay state,
then persists an atomic observation ledger. An exact envelope digest, message
ID, and sequence may be reread idempotently; a changed record must use a new
message ID and strictly greater sequence. Two live observations passed with
retained handshake/bootstrap records and heartbeat advancement from host
sequence `1785449589383193` to `1785449589383218`.

## Privacy and authority

No input was injected and no recording occurred. The policy was shadow-only and
allowed only `observe_desktop`; pilot/model authority could not provision,
expand policy, grant consent, rotate keys, delete data, or export sensitive
artifacts. No secret value is included in this audit.

## Held gates

Production authentication, replay mutation/regression injection, restart/key
rotation, lock/Secure Desktop, heartbeat loss, suspend/resume, repeated/faulted
create/destroy and base-immutability matrices, physical stop, input, and recording
remain unproven and release-blocking where applicable.
