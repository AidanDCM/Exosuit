# Exosuit Field Failure Injection Matrix

**Status:** source test cases written where possible; live rows pending a disposable Windows/Hyper-V environment  
**Rule:** a failure is not considered handled merely because an exception exists. The expected stop, fault, quarantine, rollback, audit, and owner-review behavior must be observed.

## Evidence classes

- **S** — static schema or repository invariant.
- **U** — unit or pure-logic test.
- **P** — full fake Field pulse.
- **W** — local Windows guest evidence.
- **H** — local Hyper-V host/guest evidence.
- **O** — owner acceptance.

Only S/U/P evidence exists in this branch until commands are executed and live tests are performed.

## Channel and identity

Durable replay fault cases include restart after acceptance, corrupt or oversized state, wrong Field generation/direction/key identity, duplicate message ID/nonce, and sequence rollback. Every case must deny before command handling.

| Injection | Expected response | Existing evidence | Required live evidence |
|---|---|---|---|
| Change payload after signing | reject payload hash | U, shared TS/.NET fixture | send modified packet over selected transport |
| Change signature | reject signature in constant time | U | packet mutation |
| Reuse message ID | replay denial | U | resend after normal message |
| Reuse nonce with a new ID | replay denial | U | transport-level replay |
| Decrease or repeat sequence | deny | U | restart and reconnect sequence tests |
| Wrong direction | deny | U | host-to-guest message on guest-to-host receiver |
| Wrong key ID | deny | U | old-key traffic after rotation |
| Expired message | deny | U | delayed transport delivery |
| Prior Field generation | deny and plan new generation if trust changed | U | stale guest process after rollback |
| Guest boot ID changes inside generation | fault | U | reboot guest without generation transition |

## Heartbeat and runtime health

| Injection | Expected response | Existing evidence | Required live evidence |
|---|---|---|---|
| No heartbeat | unknown then provisioning timeout | U contract | H |
| Heartbeat stale beyond degraded threshold | degraded | U | process suspend |
| Heartbeat stale beyond fault threshold | fault and stop/reprovision plan | U | guest kill/network break |
| Locked session reports ready | reject heartbeat | U | lock guest session |
| Secure Desktop reports ready | reject heartbeat | U | UAC/Secure Desktop |
| Fault code present | fault state and diagnostic code only | U | guest provider failure |
| Huge queue depth | accepted only within schema max; health monitoring may degrade later | U schema | load fixture |

## Bootstrap

| Injection | Expected response | Existing evidence | Required live evidence |
|---|---|---|---|
| Wrong manifest digest | reject | U | guest report sent to host |
| Wrong agent/session identity | reject | U | start second guest agent |
| Missing directory | not ready | U | delete fixture directory |
| Wrong display resolution | failed check | U, script logic | change guest resolution |
| Agent binary missing | failed check | script logic | remove fixture binary |
| Heartbeat not authenticated | not ready | script and U | H |
| Duplicate bootstrap check | reject | U | malformed report |
| Check timestamp outside interval | reject | U | malformed report |

## Provisioning and storage

| Injection | Expected response | Existing evidence | Required live evidence |
|---|---|---|---|
| Base image digest mismatch | stop before VM mutation | script and U | H |
| Personal-state ID or generation mismatch | stop before VM mutation | script and U | H |
| Partial personal-state identity | reject contract before planning | U | H |
| Sealed personal-state snapshot digest mismatch | reject snapshot restore; never attach as trusted | planned | H |
| Runtime overlay parent mismatch | reject plan | U | H |
| Overlay and task disk share identity | reject plan | U | H |
| Existing generation directory | refuse apply | script | H |
| Existing VM name | refuse apply | script | H |
| Isolated switch not Private | refuse apply | script | H |
| Filtered NAT requested | apply held | script | H |
| VM creation fails halfway | remove VM and generation directory | script | H |
| Rollback itself fails | `failed_rollback_incomplete`, preserve evidence | script | H |
| Destroy path contains reparse point | refuse deletion | script/static | H |
| Destroy wrong typed confirmation | refuse | script/static | H |
| Base image changes after guest use | acceptance failure | design | H |

## Teach and visual recording

| Injection | Expected response | Existing evidence | Required live evidence |
|---|---|---|---|
| Start before consent | reject | U | W |
| Append while paused | reject | U | W |
| Disabled event source | reject | U | W |
| Event limit overflow | abort/fault | U | W |
| Recorder hook disconnects | terminal aborted episode | U | W |
| Attempt input injection in Teach | impossible by recorder API; runtime process observation required | S/U | W |
| Visual capture without consent | reject policy | U | W |
| Visual frame outside approved region | reject | U | W |
| Visual frame exceeds byte budget | reject | U | W |
| Session visual budget exhausted | stop capture | U | W |
| Retention expires | delete reference and blob through future live store | U reference ledger | W |
| Credential-bearing control appears | redact/exclude; no raw bytes or value | source rules | W/O |

## Shadow

| Injection | Expected response | Existing evidence | Required live evidence |
|---|---|---|---|
| Set `executionAllowed=true` | schema rejection | U | runtime process observation |
| Prediction and actual use different observation | reject comparison | U | W |
| Different Field generation | reject | U | W |
| Malformed trajectory time | reject | U | W |
| High aggregate accuracy | remain Shadow; no automatic Pilot promotion | S | O |

## Guest commands

| Injection | Expected response | Existing evidence | Required live evidence |
|---|---|---|---|
| Execute in Teach | block | U | W |
| Execute in Shadow | block | U | W |
| Shell route | block | U | W |
| Changed policy ID/hash | block | U | W |
| Stale scene version | block | U | W |
| Action ordinal gap | block | U | W |
| Action over budget | block | U | W |
| Missing semantic/physical capability | block | U | W |
| Pilot sends shutdown | block | U | W |
| Emergency stop after policy expiry | allow | U | W/H |
| Duplicate command ID | block | U | W |

## Artifact boundary

| Injection | Expected response | Existing evidence | Required live evidence |
|---|---|---|---|
| `..`, drive, UNC, ADS, device name, trailing dot/space | reject path | U | W |
| Reparse point in ancestor | reject live transfer | pure assertion + script | W/H |
| Wrong transfer direction | reject | U | W |
| Sensitive ordinary export | reject | U | W/O |
| Untrusted export | reject until reviewed/reclassified | U | W/O |
| Size mismatch | fail transfer | U | W |
| SHA-256 mismatch | fail/quarantine | U/recovery | W |
| Bytes change after verification | detect or redesign copy to verify final destination | gap | W/H |
| Cancel after completion | reject | U | W |

## Recovery

| Injection | Expected response | Existing evidence | Required live evidence |
|---|---|---|---|
| Idempotent operation, no effect, first transient failure | one bounded retry | U | W |
| Same operation fails again | stop/review | U | W |
| Possible unverified effect | freeze, reconcile, deny retry | U | W/O |
| Channel authentication/replay/boot/display/attestation failure | stop, destroy disposable state, increment generation, reprovision | U | H |
| Artifact integrity failure | quarantine and review | U | W |
| Recorder/visual budget failure | abort evidence and review | U | W |
| Emergency stop failure | deny continuation; no automated recovery | U | W/H/O |

## Diagnostics and audits

| Injection | Expected response | Existing evidence | Required live evidence |
|---|---|---|---|
| Put token/password/cookie in support bundle | reject | U | W |
| Put screenshot/window title/UI value/operator identity in support bundle | reject | U | W/O |
| Tamper support bundle | integrity failure | U | W |
| Tamper demonstration ciphertext | authentication failure | U | W |
| Wrong demonstration key | hide from list and fail direct load | U | W |
| Corrupt Field Manager audit event | chain verification failure | U foundation | W |

## Promotion rule

A release candidate must have:

1. all S/U/P tests passing on the exact commit;
2. every W/H row either passing with evidence or explicitly held out of the promoted capability;
3. no Critical or High row marked “unknown” for a capability being enabled;
4. emergency stop, generation isolation, guest authentication, base-image immutability, destruction confinement, and no-blind-retry tests passing;
5. owner verdict recorded.
