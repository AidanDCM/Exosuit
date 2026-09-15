# Atomic audit: protected Windows Field channel secret

## Verdict

PASS for a disconnected Windows secret-store primitive at source/local-test
scope. Provisioning conversion, guest LocalSystem execution, live rotation, and
production use remain DENIED.

## Authority and protected object

The primitive belongs to the Field guest environment. It does not grant Glove,
pilot, model, MCP, or remote administration authority. It accepts an exact
`FieldReference` and key ID from a future local authority and persists only a
bounded encrypted envelope. It does not create policy, rotate a key, contact a
guest, or change the currently configured KVP runtime.

`DpapiLocalMachineFieldChannelSecretProtector` uses Windows DPAPI LocalMachine.
Its optional entropy is a SHA-256 digest over a length-prefixed domain, exact
Field UUID bytes, generation, key ID, and algorithm. LocalMachine DPAPI permits
decryption by principals on the same Windows machine when they can access the
ciphertext and entropy; therefore the exact file DACL and Field isolation are
mandatory, and local administrators/SYSTEM remain trusted authorities.

## Persistence and fail-closed behavior

- Secret input is bounded from 32 through 16,384 bytes and copied only for the
  protection call; the working plaintext copy is zeroed in `finally`.
- The JSON envelope contains contract version, exact Field reference, key ID,
  algorithm, and base64 ciphertext. Plaintext is not serialized.
- Envelope bytes and base64 length are bounded; JSON is strict and rejects
  unmapped members and case variants.
- Read verifies the DACL before opening the file, then rejects empty/oversized,
  malformed, legacy plaintext, cross-generation, wrong-key, wrong-algorithm,
  and non-canonical base64 input before returning any secret.
- Protector authentication failure is mapped to a generic denial and does not
  expose provider text.
- Save writes an exclusive temporary file, flushes it to disk, applies and
  verifies its DACL, then atomically renames it. A pre-publication failure
  preserves an existing target and attempts to remove the temporary file.
- The Windows file policy disables inheritance and accepts exactly two explicit
  allow rules: LocalSystem and Built-in Administrators, both full control.

## Evidence

Eight focused tests cover fake-provider round trip/no-plaintext persistence,
file-policy invocation, generation/key/ciphertext faults, malformed/plaintext/
oversize/unprotected input, strict schema/algorithm/non-canonical base64, weak
secret and invalid binding, failed replacement
preservation and cleanup, real local DPAPI round trip, and the exact real Windows
DACL. The two real-provider checks are explicitly tagged `LocalWindows`.

The first combined local-provider test was rejected at rename after the file was
sealed because the non-elevated interactive process is not SYSTEM and cannot
publish a SYSTEM/Administrators-only file. The test was corrected to preserve
the authority boundary: DPAPI and ACL are checked separately here, and combined
publication is held for an authenticated guest LocalSystem acceptance run.

## Held gates

- no runtime or provisioning code reads this format;
- the current development provisioning seed remains plaintext and must not be
  silently migrated or claimed protected;
- combined save/load under the guest LocalSystem service is not run;
- directory ACL validation, reparse defense, concurrent writers, crash and
  power-loss injection, backup/recovery, revocation, and secure seed deletion
  are pending;
- no real rotation provider, guest prepare/commit/rollback protocol, owner UI,
  or live old-key rejection is implemented;
- no MCP surface is added, and production remains deny-by-default.

## Rollback

Remove `ProtectedFieldChannelSecretStore.cs`, its tests, and these documentation
references. No runtime or provisioning behavior depends on the primitive.
