# Atomic audit: Field channel-secret protection command

## Verdict

PASS for a fixed source-level command boundary with fake-converter evidence.
Guest LocalSystem execution, provisioning/startup wiring, protected runtime
reading, and production use remain DENIED.

## Authority and scope

The command belongs to the Field guest environment. It verifies the exact
LocalSystem SID before inspecting configuration state and accepts no model,
MCP, remote, pilot, owner-token, or service-role substitute. Production accepts
only the literal `C:\Exosuit\Config\guest-runtime.json` argument. Field identity,
generation, key ID, and `C:\Exosuit\Config\channel-secret.txt` are derived only
from that configuration and are not command-line inputs.

The command is an explicit `Program` branch. Ordinary KVP startup, the guest
service, provisioning scripts, and MCP do not invoke it.

## Parsing, path, and output behavior

- Config root and runtime configuration reparse points deny.
- The configuration is bounded to 32 KiB, nonempty, and parsed as valid UTF-8
  JSON with case-sensitive known properties and no duplicate property names.
- The shared Field runtime contract validates version, Field generation, agent,
  key, required paths, and heartbeat bounds before conversion.
- The seed path must exactly equal the direct case-sensitive Config child.
- Success output contains only version, Field binding, key ID, status, completion
  time, and SHA-256 ciphertext-envelope digest. It contains no secret or path.
- Converter/store failures stop without a success receipt.

## Evidence

Five source tests cover exact derivation, LocalSystem denial before configuration
access, alternate/dot-segment path rejection, injected reparse points, malformed,
unknown, duplicate, oversized, and wrong-seed configurations, fixed production
constants, and metadata-only serialization.

## Held gates and residual risk

- The current KVP runtime still reads plaintext. Provisioning still creates a
  plaintext seed. The command must not be placed in either flow until a reviewed
  protected-only runtime reader makes the transition recoverable.
- Source tests do not prove guest ACLs, reparse/TOCTOU resistance under hostile
  concurrent filesystem changes, combined LocalSystem DPAPI/DACL behavior,
  crash/power-loss handling, or restart.
- Namespace replacement is not forensic secure erasure. Overlay destruction,
  host seed retirement, snapshots, backups, and storage reuse remain separate.
- Session lock, Secure Desktop, heartbeat loss, replay, overflow, uncertain
  desktop effects, and emergency stop are unchanged because this command is not
  a desktop-action or runtime-message path.
- No policy, consent, export, recording, rotation, or Field administration
  authority is added.

## Rollback

Remove the command class, its `Program` branch, converter interface, tests, and
documentation. No ordinary runtime or provisioning caller depends on it.
