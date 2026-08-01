# Atomic audit: Field secret startup transaction

## Verdict

PASS for source-level fixed-launcher ordering and metadata-receipt validation.
Combined guest LocalSystem execution, restart/failure injection, and production
use remain DENIED.

## Authority and scope

This transaction belongs to the Field guest LocalSystem launcher. It does not
add an MCP, model, pilot, remote, owner-token, or host administration surface.
The launcher invokes only the fixed compiled protection command with the exact
runtime configuration, then starts the existing protected-only guest emitter.

## Ordering and receipt behavior

- Bootstrap precheck completes before protection begins.
- The protection command must exit successfully and emit exactly one captured
  JSON receipt; its stdout is not forwarded as a log or launcher result.
- Top-level and nested Field properties must match exact schemas.
- Contract version, Field ID/generation, key ID, converted/already-protected
  status, lowercase 64-character ciphertext digest, and completion time within
  the bounded startup window are required.
- Any command, output-count, JSON, schema, binding, status, digest, or freshness
  failure throws before `--field-guest-kvp` is invoked.
- Restart accepts only a freshly verified `already_protected` receipt; the
  converter does not rewrite the envelope.

## Evidence

The focused 158-test Field suite passes with static assertions for command
presence, ordering, exact receipt checks, bounded error behavior, and absence of
an alternate listener. Windows PowerShell 5.1 parses the modified launcher with
zero errors.

## Held gates and residual risk

- Static ordering does not prove process control, DPAPI/DACL composition, output
  capture, service supervision, restart, or heartbeat absence in a guest.
- A crash after protected publication but before receipt validation stops. The
  next invocation reconciles through exact protected-envelope verification; it
  never restores plaintext.
- Atomic namespace replacement is not forensic erasure. Host seed material,
  prior overlay blocks, snapshots, backups, and disposal remain separate.
- The bounded error file may contain reviewed generic denial messages but must
  never contain secret/configuration contents or a receipt.
- Host verification still uses its separate secret lifecycle. Rotation remains
  owner-authorized and unproven live.
- Recording, consent, export, policy, input, session lock, Secure Desktop,
  uncertain-effect handling, and emergency-stop authority are unchanged.

## Rollback

Revert the launcher transaction and use the prior reviewed binary only in a new
disposable development generation. Do not deploy a rollback that combines the
protected-only emitter with plaintext startup or restores plaintext fallback.
