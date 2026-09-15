# Level 4 atomic audit — CHN-001 acceptance contract

## Decision

The change is approved for source validation only. It adds no transport,
execution, recording, or model authority. CHN-001 remains unpromoted.

## Protected boundaries

- Production evidence requires development access and unattended development
  setup both false.
- Every accepted KVP observation binds exact Field, generation, boot, key,
  direction, sequence, nonce, message ID, TTL, and payload hash.
- The shared replay high-water mark must advance durably across captures.
- Captured envelopes may support mutation/replay tests but cannot substitute for
  real guest lock, Secure Desktop, display, heartbeat-loss, or stop evidence.
- Healthy, degraded, and recording emergency stops remain channel/model
  independent and individually mandatory.
- Cleanup targets only one exact disposable generation and proves the immutable
  base unchanged.

## Abuse review

The contract does not accept model assertions, policy expansion, Field
administration, secrets, screenshots, raw UI text, or demonstration content.
It adds no network listener and keeps Hyper-V KVP as the bounded VMBus metadata
transport. Selective reading cannot bypass authentication because each selected
envelope still passes the compiled verifier and common replay state.

## Evidence boundary

Passing unit tests proves only that malformed or incomplete run summaries are
rejected. Live `hyperv_host_guest` evidence and independent technical promotion
remain separate future actions.
