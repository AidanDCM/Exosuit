# Atomic audit: protected Field guest KVP secret reader

## Verdict

PASS for source-level protected-only guest emitter wiring with fake-store
evidence. Startup conversion, combined guest LocalSystem DPAPI/DACL execution,
restart, and production use remain DENIED.

## Authority and scope

This reader belongs only to the Field guest KVP emitter. `RunGuestAsync` obtains
the real process SID and requires exact LocalSystem before reading runtime
configuration. It then uses the protection command's bounded, strict,
duplicate-rejecting, reparse-aware configuration loader. The reader independently
repeats the identity check before path or store access. No model, MCP, remote,
pilot, owner-token, or service-role value can substitute.

The host KVP observer is not changed. Guest-machine DPAPI ciphertext is not a
host verification key and must never be treated as one.

## Secret and path behavior

- Runtime configuration must be the literal direct
  `C:\Exosuit\Config\guest-runtime.json` path.
- The secret path in that validated configuration must be the literal direct
  `C:\Exosuit\Config\channel-secret.txt` path.
- Config-root and secret-file reparse points deny before protected-store access.
- The protected store receives the exact Field generation and key ID, verifies
  the envelope/DACL, and performs guest-machine DPAPI decryption.
- Decrypted bytes must be 32 through 16,384 printable ASCII bytes. Invalid bytes
  are zeroed and denied.
- The emitter has no plaintext-file fallback and zeroes its loaded byte buffer
  on exit.

## Evidence

Five fake-store tests cover exact binding, non-SYSTEM denial before path/store
access, alternate runtime and secret paths, injected Config/secret reparse
points, short/oversized/control bytes, zeroing after rejection, and proof that a
plaintext file is not read when the protected store denies. The full Windows
agent compiles with the production reader wired into `RunGuestAsync`.

## Held gates and residual risk

- Provisioning still places plaintext and startup does not yet invoke the
  protection command. A new Field using this binary therefore fails closed
  before KVP publication until the next startup-transaction slice.
- The current channel-authentication API converts accepted bytes to a managed
  ASCII string that cannot be deterministically zeroed. The byte buffer is
  cleared, but managed-memory retirement remains pending.
- Source reparse checks do not prove resistance to concurrent namespace changes.
- Combined LocalSystem, DPAPI, DACL, cancellation, restart, crash/power-loss,
  seed retirement, and stale-generation behavior remain unproven in a guest.
- Host-side verification still needs its own protected secret storage and
  owner-authorized rotation. It cannot reuse guest DPAPI ciphertext.
- Recording, consent, policy, export, desktop input, uncertain-effect handling,
  session lock, Secure Desktop, and emergency stop authority are unchanged.

## Rollback

Remove `ProtectedFieldKvpSecretReader`, its tests, and the guest-emitter wiring,
then restore the prior plaintext reader only on a development-only branch. No
production rollback may re-enable plaintext fallback; deployed rollback should
instead use the prior signed binary and disposable generation.
