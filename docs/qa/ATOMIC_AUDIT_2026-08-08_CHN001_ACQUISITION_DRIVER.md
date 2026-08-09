# Level 4 atomic audit: CHN-001 acquisition driver

## Verdict

Source contract passes focused validation. Live execution and promotion remain denied.

## Security findings

- The pre-existing bootstrap payload lacked a boot ID, making the CHN candidate schema
  impossible to satisfy without host fabrication. Bootstrap is now bound inside the
  guest-signed payload before envelope creation.
- Compiled verification output now includes the exact non-secret metadata needed by
  the candidate; missing boot binding fails serialization.
- Repeated snapshots share one protected observation ledger. Unchanged handshake and
  bootstrap are idempotent; changed messages must advance sequence and cannot reuse an
  ID. The harness deduplicates only byte-equivalent normalized messages.
- Session start derives trust from a clean Git commit, parsed production provisioning
  plan, protected runtime config, live VM GUID/state, and rehashed base—not from caller
  labels alone.
- Finalize checks actual VM/generation-root absence and rehashes the base. Caller
  booleans cannot assert cleanup.
- Imported ceremony artifacts must pass closed injection/stop schemas binding exact
  source, machine, Field/generation, VM, mode/scenario, outcome, timing, and raw source
  digest. They still require independent review before live promotion.

The driver has no VM lifecycle, desktop, input, recording, stop, policy, key-rotation,
export, or MCP authority. Emergency-stop failure remains release-blocking and has no
automated recovery path.

The `prepare` addition closes the pre-provisioning gap without expanding those
authorities. It emits an isolated no-development plan, exactly four guest seed files,
and one matching host observation configuration beneath a SID-restricted ignored
directory. Secret bytes are generated locally, duplicated only for the guest/host sides
of the same generation, never printed, and never included in evidence. `bind` accepts
only the exact still-clean commit and the GUID of the one running planned VM. These are
preparation controls, not proof that provisioning, DPAPI conversion, boot, or CHN passed.

The first authenticated v26 capture exposed a serialization boundary: PowerShell emits
valid ISO 8601 `DateTimeOffset` values with `+00:00`, while the initial acquisition schema
accepted only `Z`. The capture, injection, and stop artifact schemas now explicitly accept
ISO offsets, retain strict datetime validation, and canonicalize imported ceremony times
before candidate construction. Regression coverage uses the observed live timestamp shape.

The next live snapshot showed that the compiled observer assigns a fresh local `verifiedAt`
whenever it re-verifies an unchanged handshake or bootstrap envelope. Acquisition identity
therefore compares every retained envelope/security field except that observer-local time,
keeps the first valid verification time, and continues to reject any changed message ID
binding, nonce, sequence, boot ID, key ID, payload hash, status, or transport.
