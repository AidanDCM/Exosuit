# Atomic audit: Field v22 protected KVP canary

## Verdict

PASS for the bounded development-access protected-observation canary.
Production, execution, recording, owner-authorized rotation, actual
stale-generation replacement, and promotion remain DENIED.

## Exact identity

- Source commit: `6de98c9d36fe44bedc6e5284914805204c8aac2b`
- Agent SHA-256: `520e486151cbfc03e09ce104ba5ca2746646f9d374c63ff14e90726c6d3d3755`
- Base: `exosuit-field-base-v22`
- Base SHA-256: `4c8fbe970a17c2980a013cf9016e82fa135a29a65d4fedcbafebbaf57c002b71`
- Field: `4e0f7c83-3c7f-4be8-90f9-2ee024830980`
- Generation: 1
- VM: `Exosuit-Field-4e0f7c83-3c7f-4be8-90f9-2ee024830980-G1`

## Evidence proved separately

- Base construction/sealing: exact agent and source binding, detached SYSTEM
  maintenance, built-in Audit administrator, canonical Sysprep, no non-built-in
  account, service Manual until SetupComplete, read-only promotion.
- Provisioning/isolation: exact preview, private Field switch, exact immutable
  parent, generation-scoped disposable OS overlay and task disk.
- Authenticated readiness: premature missing-handshake observation failed; a
  bounded retry authenticated bootstrap status `ready`.
- Protected state: contract 1, HMAC-SHA256, exact Field/generation and key ID.
- Negative inputs: altered tag, payload, key ID, generation metadata, plaintext
  legacy state, and oversize state all failed closed with input bytes unchanged.
  The authoritative ledger was not used as a mutation target and its SHA-256
  remained exact across the six-copy matrix.
- Recovery: the untouched authoritative ledger later authenticated under the
  same key and advanced its sequence strictly with a new protected digest.
- Destruction: the exact VM and generation root were removed; the immutable v22
  base remained read-only and digest-identical.

## Boundaries and findings

The generation remained Shadow observation only. No input, screenshot, scene,
Teach event, recording, artifact transfer, Pilot command, host share, policy
expansion, key rotation, or consent change occurred. No secret values are
present in committed evidence.

The stale-generation negative changed a copy's generation metadata; it is not
evidence for destruction/reprovision into generation 2 with an old validly
authenticated state. The wrong-key negative changed a copy's key ID; it is not
an owner-authorized key-rotation workflow. Both larger lifecycle gates remain
held explicitly.

## Held gates

Production key protection and rotation, actual stale-generation replacement,
lock/Secure Desktop, deliberate heartbeat loss, VM pause/resume, physical stop,
production authentication, input, recording, artifact transfer, Pilot,
packaging, signing, updater/rollback, penetration test, and release remain
unproven or disabled.
