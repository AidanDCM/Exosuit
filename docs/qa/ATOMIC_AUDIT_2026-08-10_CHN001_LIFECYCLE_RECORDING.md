# Level 4 atomic audit: CHN-001 lifecycle-gated recording

## Decision

Approved for source validation. CHN candidate validation and completion evidence
recording remain separate. Recording now fails before consuming a single-use artifact
unless the existing host-signed lifecycle ledger proves the exact created Field/VM/base,
a verified heartbeat inside a signed boot window, and terminal destruction.

## Trigger

The independently approved G1 candidate could not be promoted because its Field
generation was never entered into the completion lifecycle ledger. Owner-service job
receipts and authenticated KVP captures are useful candidate evidence but are not a
retroactive host-signed created/booted/stopped/destroyed chain.

## Authority and data flow

- The new guard grants no Field, VM, recording, input, policy, or model authority.
- It invokes the existing completion recorder only after local verification succeeds.
- The existing live host key and TPM participation path sign the evidence record.
- The generic evidence verifier, lifecycle verifier, ledger transition rules, and
  independent technical-review signature remain unchanged.
- The candidate artifact contains hashes and bounded metadata, not secrets, raw UI,
  screenshots, credentials, or recording content.

## Failure behavior

Recording is rejected for an invalid candidate, broken lifecycle signature/chain,
missing or duplicate created/destroyed events, wrong VM GUID, wrong immutable-base hash,
wrong run/machine binding, no heartbeat in an exact boot window, or a candidate commit
outside the signed baseline ancestry. No evidence store write occurs before those checks
pass.

The runbook requires a new heartbeat after each signed `booted` event and requires every
actual reboot/stop transition to close the old boot before opening the new boot. It
forbids backdating and retrospective lifecycle import.

## Negative boundary

The approved G1 candidate remains candidate-only and receives no completion credit.
This change cannot repair G1, record ACT-001.23 or TCH-001.12, co-sign a transition, or
promote CHN-001. A new live G2-or-later acquisition must supply the lifecycle chain.

## Rollback

Revert the source slice. Any unrecorded candidate remains unchanged. If evidence was
recorded and later invalidated, append revocation/remediation through the completion
ledger; never edit signed records.
