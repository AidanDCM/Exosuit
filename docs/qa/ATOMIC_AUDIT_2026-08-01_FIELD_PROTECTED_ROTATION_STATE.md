# Atomic audit: protected Field rotation state

## Verdict

PASS for a pure authenticated metadata-store component. Protected secret
ownership, Windows ACL acceptance, live rotation, and production remain DENIED.

## Protected object and boundary

The store contains only channel-key rotation coordinator metadata: exact Field
identity/generation, active key ID, blocked status, bounded recent rotation IDs,
and the last sanitized result. It does not store a channel secret, integrity
secret, provider secret handle, Windows credential, or guest payload.

The caller supplies a separate integrity secret of at least 32 characters. The
store serializes validated state into a bounded base64 payload and authenticates
a domain separator, exact Field ID/generation, algorithm, and payload with
HMAC-SHA256. Load verifies the tag with fixed-time comparison before parsing the
authority payload.

## Persistence and failure behavior

- Missing file returns no state; every other malformed condition throws.
- Empty/non-file/oversized envelopes fail closed before payload use.
- Plaintext legacy state, malformed envelope, wrong secret, changed tag/payload,
  and cross-generation envelopes fail closed.
- Authenticated but contradictory coordinator state fails schema validation.
- Rejected reads do not replace or repair bytes.
- Save uses a mode-0600 exclusive temporary file and rename, with bounded output
  and temporary cleanup on failure.

## Evidence

Six focused tests cover round trip/no-secret persistence, missing state, valid-
shape tag and payload corruption with unchanged bytes, wrong secret, plaintext
legacy, cross-generation load, oversize, weak secret, contradictory state,
repeated atomic replacement, and absence of temporary files.

## Held gates

Node file mode is not Windows ACL evidence. DPAPI, credential-vault ownership,
integrity-secret provisioning/rotation, crash and power-loss injection,
concurrent writers, directory reparse defense, backup/recovery, live provider
wiring, guest acknowledgment, and owner-visible rotation remain unproven.
