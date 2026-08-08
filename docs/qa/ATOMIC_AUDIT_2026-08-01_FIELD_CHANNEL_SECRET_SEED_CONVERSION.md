# Atomic audit: Field channel-secret seed conversion transaction

## Verdict

PASS for a disconnected fake-provider transaction primitive. A fixed guest
command, service wiring, runtime protected read, combined LocalSystem DPAPI/DACL
execution, and production use remain DENIED.

## Authority and scope

Conversion belongs to the Field guest environment. The converter checks the
exact LocalSystem SID before reading the seed and accepts no model, MCP, remote,
pilot, or service-role substitute. It binds one exact Field generation and key
ID and confines the target to the direct, case-sensitive
`Config/channel-secret.txt` child of a non-drive-root Config directory.

The converter is a library component only. It is not exposed through `Program`,
the Windows service, PowerShell, provisioning, KVP runtime, or MCP.

## Transaction and failure behavior

- Config-root and seed reparse points deny before conversion.
- Input is bounded to 16 KiB. A legacy seed must be 32 through 16,384 printable
  ASCII bytes; only trailing CR/LF is normalized.
- Input whose first non-whitespace byte is `{` is treated only as a protected
  envelope. Malformed or cross-bound JSON never falls back to plaintext.
- Conversion calls the protected store against the same path, so its exclusive,
  flushed, pre-sealed temporary file atomically replaces the namespace entry.
- The converter reloads the protected secret and compares it to the seed in
  fixed time before returning success. Working plaintext and reloaded bytes are
  zeroed.
- A repeated invocation verifies the existing protected envelope and exact
  Field generation/key without rewriting it.
- The result contains contract version, Field, key ID, status, completion time,
  and SHA-256 of the ciphertext envelope only.
- Pre-publication policy failure preserves the original seed and removes the
  temporary file. A post-publication verification failure stops; it does not
  restore plaintext.

## Evidence

Seven fake-provider tests cover successful in-place conversion, no plaintext in
the result file, idempotent restart without rewrite, wrong generation/key,
non-SYSTEM denial before access, malformed protected-looking input, weak/control/
oversized seed rejection, escaped/noncanonical path denial, injected Config and
target reparse points, and pre-publication preservation/cleanup.

## Held gates and residual risk

- The current guest runtime still reads plaintext and provisioning still seeds
  plaintext; this component changes neither behavior.
- Atomic replacement removes the live plaintext namespace entry but is not
  forensic secure erasure. Prior blocks, storage snapshots, host seed material,
  and backup retention require separate retirement evidence.
- Real combined operation must run as guest LocalSystem. The non-elevated host
  cannot publish a SYSTEM/Administrators-only file and must not be used as a
  substitute.
- Concurrent writers, post-publication crash/power loss, exact receipt storage,
  runtime restart, overlay destruction, and stale-generation replacement remain
  unproven.
- No key is rotated and no policy, recording consent, export, or Field authority
  can be created through this slice.

## Rollback

Remove `FieldChannelSecretSeedConverter.cs`, its tests, the protected-store
interface, and the associated documentation. No live code depends on it.
