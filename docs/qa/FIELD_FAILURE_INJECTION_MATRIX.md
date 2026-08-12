# Exosuit Field Failure Injection Matrix

> 2026-08-12: live scene launch/intake/publication failures now persist one bounded, content-free latest-reason diagnostic at `C:\Exosuit\Logs\scene-runtime-error.log`; readiness still invalidates and no uncertain publication is retried.
> 2026-08-12: automatic interactive-producer launch now creates and destroys the verified user's Windows environment block; environment creation failure denies launch and requires a fresh-generation live rerun.
> 2026-08-12: the one-use scene intake is now armed before producer launch; arm failure prevents process creation and launch failure disposes the listener before invalidation.
> 2026-08-12: arming now creates the actual ACL'd named-pipe server rather than only its wrapper; pipe ownership is established before the producer gets its single connection attempt.

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
| Wrong key ID | deny | U plus fake owner-rotation/replay-guard integration | old-key traffic after live rotation |
| Pilot/service/remote/stale rotation request | deny before provider effect | U | local owner UI/transport acceptance |
| Rotation commit fails after prepare | reconcile; roll back prepared key or adopt only proven next-active state | U fake provider | Windows provider crash/fault injection |
| Rotation reconciliation unknown or rollback fails | trust neither key; block continuation for owner review | U fake provider | host/guest restart and storage fault injection |
| Corrupt, wrong-secret, legacy, oversized, or cross-generation rotation metadata | reject before authority-state hydration; preserve bytes | U protected file store | Windows ACL, crash/power-loss, and vault injection |
| Wrong generation/key, malformed/plaintext/oversized envelope, corrupt DPAPI ciphertext, or unexpected secret-file ACL | deny before returning secret; preserve prior published envelope on pre-publication failure | U fake providers plus separate local DPAPI and exact ACL checks | combined guest LocalSystem, reparse, crash/power-loss, and live rotation injection |
| Non-SYSTEM seed conversion, escaped/noncanonical path, reparse endpoint, protected-looking corruption, weak/control/oversized seed, wrong restart generation/key, or pre-publication policy failure | deny; do not interpret corrupt JSON as plaintext; preserve input before publication | U conversion transaction with fake protected store | live fixed guest CLI, combined LocalSystem DPAPI/DACL, post-publication interruption, secure retirement, and live restart |
| Non-SYSTEM protection command, alternate config spelling, Config/config-file reparse, malformed/oversized/unknown/duplicate config property, or noncanonical seed binding | deny before converter effect; emit no receipt or secret | U fixed-command suite with fake converter and path inspector | combined guest LocalSystem command, config ACL/TOCTOU, provisioning order, and live restart |
| Non-SYSTEM guest emitter, alternate runtime/secret path, Config/secret reparse, wrong Field generation/key, protected-store denial, or invalid returned bytes | deny before KVP publication; never read plaintext fallback; zero rejected/owned byte buffers | U protected-reader suite and compiled emitter wiring | guest LocalSystem DPAPI/DACL, concurrent namespace change, cancellation/restart, and pre-heartbeat denial evidence |
| Protection process failure or zero/multiple/malformed/extra-property/stale/future/wrong-Field/wrong-key/bad-status/bad-digest startup receipt | stop launcher before emitter; publish no heartbeat; retain bounded error only | W PowerShell subprocess adapter harness for nonzero/malformed/no-receipt denial and converted/already-protected success; S remaining receipt variants | combined guest LocalSystem process faults, idempotent restart, and observed heartbeat absence |
| Compiled protection receipt and launcher use different digest property names | stop before emitter; exact schema mismatch must be caught by a cross-layer contract before image build | v23/v24 missing-handshake H diagnosis; exact .NET serialized schema U plus compiled/launcher source contract S; v25 generation-3 LocalSystem authenticated handshake/bootstrap/heartbeat and restart H | production-repeatable H |
| Session remains locked during guest startup | after one valid precheck and protected-secret receipt, publish authenticated provisioning only; keep readiness denied; refresh bootstrap; stop exact child on timeout/early exit | W locked-then-unlocked and never-unlocked subprocess harness; v23 live negative timing diagnosis | rebuilt-base live provisioning KVP, unlock transition, Secure Desktop, crash, and service-recovery W/H |
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
| Guest service is Automatic in sealed base | reject base receipt/promotion; do not boot as trusted | S/U | offline base inspection and fresh canary |
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
| Base image changes after guest use | acceptance failure | v24 remained read-only and digest-identical across exact generation-1/generation-2 lifecycle; v25 remained read-only and digest-identical across generation-3 provision/restart/observe/destroy H | repeated production matrix H |
| Owner-service policy expired, future-dated, over 180 days, wrong SID, or unknown operation | deny before service/job effect | .NET policy tests | installed-service W/H |
| Owner-service job stale, replayed, wrong policy, wrong generation, or wrong plan digest | deny before lifecycle command | .NET job/command tests | installed-service W/H |
| Installed owner-service script or host config changed | service refuses job before process start | .NET digest validation plus installer static tests | installed-file tamper W/H |
| Owner-service package has unexpected entry or reparse point | deny; do not traverse or execute | .NET command/static tests | NTFS reparse W/H |
| Active Field bound reached | deny provisioning | .NET source test plus installed-service capacity denial H | production multiple-generation matrix H |
| Owner service stops during lifecycle child | cancel and kill exact process tree; preserve terminal result | .NET source test | live cancellation H |
| Windows PowerShell 5.1 receives a string-valued common `Confirm` switch through the native `-File` boundary | lifecycle command fails before mutation; fixed service uses a LocalSystem-only noninteractive flag after exact typed confirmation | S/U, installed-service pre-effect failure, and successful exact generation-1/generation-2 provision/destroy H | repeated production matrix H |
| Installed provisioning script's fixed host-capability dependency is absent or changed | fail before Hyper-V mutation; installer and service policy hash-bind and verify the dependency | installed-service pre-effect failure, S/U repair, reviewed reinstall, and successful generation-1/generation-2 provision H | installed-file tamper and production-repeatable H |

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
| Host emergency stop during active consented recording | stop hooks and pending input within five seconds without model/channel dependency; Field Off | strict TCH-001.12 proof schema | W/H/O after live hooks exist |

## Scene observation

| Injection | Expected response | Existing evidence | Required live evidence |
|---|---|---|---|
| Wrong Field generation, key, direction, boot, Glove agent, or Windows session | reject before replay/scene state advances | U | W/H |
| Raw window title, element name/value, screenshot field, or sensitive automation authority | schema rejection | U | W/O leakage inspection |
| Zero scene sequence, replay, non-increasing sequence, or capture-time regression | reject; next valid durable sequence remains usable | U | W/H restart stream |
| Payload, window, element, or warning bound exceeded | reject before state advances | U | W/H backpressure |
| LocalSystem/session-0 process presented as interactive producer | no producer wiring exists; reject architecture promotion | S/U contract boundary | W/H session-local identity proof |
| Provider warning contains private UI content | discard warning text before serialization; receiver permits only fixed sanitization notice | .NET/TS U | W/O leakage inspection |
| Structural payload exceeds safe KVP budget | reject above 12 KiB without truncating the scene | .NET/TS U | W/H backpressure |
| Reuse v1 `windowsSessionId=0` as UIA client proof | reject; service-session evidence is not interactive evidence | S/U relay policy | W/H OS-derived session receipt |
| Wrong relay caller, client PID/session/user SID/path/digest | reject before SYSTEM signature | .NET U | W/H secured-pipe process race |
| Duplicate/unknown JSON or post-producer payload modification | reject before signature; require exact normalized representation | .NET U | W/H relay fuzzing |
| Connected relay pipe absent or client exits during Windows fact resolution | reject without returning client facts or signing | .NET U/local Windows | W/H process race |
| Pipe payload claims a different PID/session/SID/path | ignore claims; derive facts from connected pipe and Windows process/token | local Windows | W/H production IPC |
| Unapproved principal opens the scene intake pipe | ACL names only SYSTEM and the one approved interactive SID; every other principal falls to default deny | .NET U/local Windows | W/H hostile local principal |
| Producer reads from the intake or creates a rival instance on the name | `ReadData` and `CreateNewInstance` withheld; name squatting refused | .NET U | W/H |
| Frame declares zero, oversized, or truncated length, or sends a second frame on one connection | reject before or at read; the connection budget is spent so no retry on the same instance | .NET U/local Windows | W/H |
| Producer launched into session 0, a wrong session, a wrong user, or from a replaced binary | refuse before `CreateProcessAsUser`; digest recomputed from the file about to run | .NET U | W/H live cross-session launch |
| Non-scene envelope or wrong generation offered to the KVP scene writer | refuse to publish; the writer never signs | .NET U | W/H |
| Producer dies, guest reboots, desktop locks, or Secure Desktop appears mid-session | readiness clears with the most fundamental cause recorded; a boot change is terminal for the lifecycle | .NET U | W/H live transitions |
| Teardown after the lifecycle has forgotten the producer | the supervisor's own PID tracking still terminates it; no orphan | .NET U | W/H live kill |
| Scene value absent, missing a chunk, digest mismatch, or holding fragments of two writes | unreadable with a specific reason; never answered with the last good scene | TS U | W/H live KVP |
| Host offered a scene captured before the desktop stopped being observable | refuse despite valid signature, boot, session, and sequence; observability barrier, ties fail closed | TS U | W/H lock/unlock cycle |
| Host-side hypervisor read fails | report a failed read, never an empty exchange | TS U | W/H |
| Exchange item declares a DOCTYPE/ENTITY, duplicates a name, or breaks size/count bounds | reject that item with an indexed reason; no XML entity machinery exists to exploit | TS U | W/H hostile guest exchange |
| Wrong VM queried for a guest exchange | constrained VM name refused before the hypervisor is called | TS U | W/H — a wrong-VM read is authentic and otherwise undetectable |

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
| Poll retained KVP handshake/bootstrap twice | freshly authenticate; accept only exact idempotent records; require heartbeat sequence advance when it changes | S/U plus v20, v21, and v25 generation-3 live repeated observation; v25 heartbeat wire sequence advanced from `1785773057626023` to `1785773057626040` | production-repeatable W/H |
| Mutate a validly signed retained KVP record at an old sequence | compiled snapshot rejection; prior ledger unchanged | .NET unit plus v21 live-captured equal-sequence rejection | production-repeatable W/H |
| Reuse a prior KVP message ID at a greater sequence | compiled snapshot rejection; prior ledger unchanged | .NET unit plus v21 live-captured rejection | production-repeatable W/H |
| Corrupt or cross-bind the KVP observation ledger | authenticate before payload use; fail closed before update; preserve prior bytes | HMAC-protected envelope plus .NET corruption/key/generation tests; v22 live copy-based tag/payload/key-ID/generation/plaintext/oversize rejection, byte preservation, and authoritative-ledger recovery | actual stale-generation replacement and owner-authorized key-rotation W/H |
| Derive a base with wrong source digest, writable source, existing target, dirty/wrong commit, seeded generation config, missing component, weak ACL, or mount/copy/hash failure | deny or roll back only the exact unpublished derived copy; source remains read-only and digest-identical | Windows script static tests | elevated offline derivation plus source/target digest and rollback W/H |
| Supply a multi-file .NET apphost where the derived base copies only `Exosuit.Agent.exe` | refuse before copy/mount; require a standalone single-file agent with no required same-stem companions | Windows script static regression; v27 live negative service-timeout evidence | corrected derived base plus LocalSystem guest startup W/H |
| Inherit an agent directory/file ACL granting untrusted write | replace derived-copy component ACLs with exact SYSTEM/Administrators Full Control and Users Read & Execute; reject any residual write/create right | first v26 attempt rejected before publication; static SID-bound ACL tests | successful v26 derivation and offline ACL receipt W/H |
| Omit boot ID or acquisition metadata from any accepted KVP result | compiled serialization fails; candidate cannot be finalized | .NET boot-binding/metadata tests and CHN harness schema tests | production-repeatable W/H |
| Return a valid PowerShell `DateTimeOffset` using `+00:00` instead of `Z` | accept the ISO offset without weakening field validation; canonicalize imported ceremony time | CHN live-shape capture regression test | authenticated v26 capture W/H |
| Re-verify an unchanged KVP envelope at a later host time | retain the first valid verification time; compare all immutable identity, replay, boot, key, hash, status, and transport fields | CHN merge regression test | repeated authenticated v26 capture W/H |
| Reuse a CHN capture message ID/nonce or change a retained message | acquisition session rejects before write | CHN harness unit tests | production-repeatable H |
| Claim cleanup while VM or exact generation root remains | finalize performs read-only host checks and denies | CHN harness source tests/inspection | production-repeatable H |
| Sign lifecycle events during a clean-commit CHN session | accept only a valid append to the tracked lifecycle ledger for the exact active Field/generation/machine; reject prefix edits, invalid signatures, cross-Field events, and every other tracked diff | CHN lifecycle-append unit/adversarial tests | fresh G3 real-time signed lifecycle H |

## Promotion rule

A release candidate must have:

1. all S/U/P tests passing on the exact commit;
2. every W/H row either passing with evidence or explicitly held out of the promoted capability;
3. no Critical or High row marked “unknown” for a capability being enabled;
4. emergency stop, generation isolation, guest authentication, base-image immutability, destruction confinement, and no-blind-retry tests passing;
5. CHN-001 v2 promotion requires one machine-checkable run satisfying every row
   CHN-001.1 through CHN-001.11; source tests or partial KVP captures cannot
   substitute for live lock, Secure Desktop, display, heartbeat-loss, and healthy/degraded stop evidence;
6. ACT-001.23 and TCH-001.12 remain mandatory downstream proofs once live execution
   and consented recording exist; neither can be asserted or migrated from CHN evidence;
7. owner verdict recorded.
