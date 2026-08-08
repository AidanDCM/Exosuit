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
