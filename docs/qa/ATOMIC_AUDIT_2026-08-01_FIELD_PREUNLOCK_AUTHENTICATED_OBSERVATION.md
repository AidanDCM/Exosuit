# Atomic audit: Field pre-unlock authenticated observation

Date: 2026-08-01

Decision: PASS for source ordering and subprocess cleanup evidence. DENY for live
corrected KVP, production authentication, input, recording, and production use.

## Authority unit

The unit is the Field LocalSystem startup transaction. One bootstrap precheck is
required before secret access. Exact protected-secret conversion and receipt
validation still occur before the KVP child starts. Starting observation while
locked grants no Glove action authority and cannot promote beyond `provisioning`.

## Live finding

The exact v23 development generation had no host-visible handshake during short
and 90-attempt observations. Read-only evidence showed the all-pass bootstrap
report arrived fifteen seconds after the long observer ended, with an empty
runtime error log and protected envelope present. V23 is negative timing
evidence, not an authenticated-KVP pass.

## New invariants

- initial bootstrap is structurally valid before protection;
- the exact fresh Field/generation/key receipt precedes KVP;
- locked-session KVP can report only authenticated non-ready/provisioning state;
- bootstrap refreshes until unlock;
- early child exit or desktop timeout stops the exact child and denies startup;
- no test switch, alternate executable, plaintext fallback, network listener,
  input, recording, or policy expansion is introduced.

The subprocess harness passes converted, already-protected,
locked-then-unlocked, nonzero, malformed/no-receipt, and never-unlocked cleanup
branches. Live corrected behavior requires a new immutable base. Process crash,
redirection failure, Secure Desktop, recovery, hard stop, power loss, and
emergency-stop evidence remain release blocking. The v23 Field is Off.

## Rollback

Restore the blocking desktop loop before the emitter and revert the new adapter
tests and documentation. Do not restore plaintext or weaken receipt validation.
