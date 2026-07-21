# Exosuit Field Threat Model

**Depth:** Level 4 security and privacy boundary review  
**Status:** source-design threat model; live Hyper-V and Windows evidence pending  
**Updated:** 2026-07-21

## Protected assets

- host desktop, files, credentials, accounts, and input devices;
- Field policy, attestation keys, channel keys, and generation identity;
- immutable base image;
- persistent personal-state disk;
- disposable runtime overlay and task disk;
- demonstration episodes and visual blobs;
- workflow artifacts;
- Glove and Field audit evidence;
- emergency-stop availability;
- owner consent and local administration authority.

## Trust boundaries

1. pilot/model to Glove supervisor;
2. Glove supervisor to local Field administration;
3. host to guest authenticated channel;
4. guest agent to Windows desktop;
5. Field filesystem to host artifact broker;
6. owner demonstrations to encrypted episode storage;
7. optional visual sensor to external visual blob storage;
8. immutable base image to disposable runtime overlay;
9. one Field generation to another.

## Primary attackers and failures

- malicious or prompt-injected content displayed inside the Field;
- a compromised or mistaken pilot model;
- replayed or modified host/guest traffic;
- stale commands from an earlier Field generation;
- a corrupted guest agent or boot identity;
- a malicious file attempting path traversal, ADS, device-name, or reparse escape;
- credential or private-content leakage through logs, demonstrations, visuals, or support bundles;
- unsafe Hyper-V configuration connecting the Field to host resources or LAN;
- accidental destruction of base or personal-state disks;
- repeated retries after an uncertain external effect;
- hidden or accidental recording without valid consent;
- emergency stop or liveness failure.

## Threat matrix

| Threat | Existing source control | Evidence written | Live proof still required |
|---|---|---|---|
| Pilot grants itself VM or consent authority | `FieldAdminAuthority` blocks `pilot_model`; review cannot be satisfied by model | unit tests and static validator | local admin UI/transport acceptance |
| Command tampering | HMAC-SHA256 envelope, payload hash, key ID, expiration | TS/.NET tests and shared fixture | actual transport fault injection |
| Replay or reordering | message ID, nonce, and strictly increasing sequence | replay tests in both languages | process restart and persistence behavior |
| Cross-generation action | every channel, heartbeat, command, scene, artifact, episode, and visual reference binds Field generation | unit tests | stale live process and rollback tests |
| Stale desktop state | exact expected scene version required for action | command and scene tests | live focus/window race injection |
| Arbitrary shell execution | no shell field in provisioning plan; guest routes exclude shell; scripts reject arbitrary evaluation | schemas, validator, script tests | command-line and process-monitor observation |
| Host desktop access | policy literals false; VM plan disables host input integration and broad drive mapping | schema tests and script guards | Hyper-V integration-service inspection |
| Host/LAN exposure | host LAN and inbound false; isolated mode requires Private switch; filtered NAT apply held | provisioning tests and PowerShell checks | packet capture and firewall acceptance |
| Writable golden image | immutable base plus disposable differencing runtime overlay | plan tests and scripts | VHD parent/child inspection after boot |
| Base/personal-state deletion | destruction script confines deletion to exact generation root and checks reparse points | static tests | disposable fixture deletion test |
| Path escape | Windows path-scope rejects absolute, UNC, drive, ADS, traversal, devices, ambiguity; live broker must inspect ancestors | unit tests | NTFS reparse/junction acceptance matrix |
| Artifact substitution | expected bytes and timing-safe SHA-256 comparison | broker tests | live cross-VM copy and TOCTOU review |
| Credential leakage in demonstrations | recursive secret-shaped redaction, encrypted terminal-only storage, raw visual bytes banned | storage/redaction tests | Windows control classification and memory review |
| Hidden visual recording | explicit consent, bounded modes, external references, redaction, byte/count/TTL budgets | policy and ledger tests | visible indicator and deletion acceptance |
| Shadow becomes execution | `executionAllowed: false` literal, no action path | tests and validator | runtime process observation |
| Teach injects input | `inputInjectionAllowed: false`, recorder has no motor dependency | tests and validator | physical input observation |
| Blind retry | recovery allows only bounded idempotent no-effect retry; uncertain effect requires reconciliation | recovery tests | live timeout and partial-effect fixtures |
| Heartbeat spoof/staleness | signed channel, expected agent/boot, sequence, time thresholds | tests | guest crash, pause, sleep, and network interruption |
| Secure Desktop/lock operation | scene and heartbeat reject ready input state | tests | actual lock/UAC acceptance |
| Diagnostic privacy leak | Field support bundle accepts only hashes and aggregate counts; forbidden fields/values | tests | support bundle manual inspection |
| Emergency-stop failure | recovery marks release blocking and denies automated recovery | tests | physical end-to-end stop test |

## Security invariants

- A pilot/model has no Field administration authority.
- A policy, consent, channel key, or attestation cannot be created by model text.
- Every mutable action is tied to one Field generation and one current scene version.
- No Field command accepts arbitrary shell or PowerShell strings.
- The guest does not control the host cursor as its primary architecture.
- The base image is immutable; the boot writer is a disposable child overlay.
- The task disk is disposable and distinct from the OS overlay and personal state.
- Host clipboard, broad drive mapping, and host input injection remain disabled.
- Teach and Shadow inject no input.
- Visual bytes are never embedded in demonstration metadata.
- Sensitive and untrusted files cannot use the ordinary export path.
- Unknown or uncertain effects stop or reconcile; they do not retry blind.
- Emergency stop remains independent of pilot success.

## Residual risks

- HMAC attestation is local software binding, not hardware-rooted remote attestation.
- Replay state is currently in-memory; process-restart sequence persistence is not implemented.
- Actual Hyper-V socket or private transport is not implemented.
- The guest Windows agent is not yet wired to the new command/channel modules.
- No real visual sensor or input hook exists, so privacy behavior is not live-tested.
- Personal-state encryption ownership and key rotation are not implemented.
- Filtered NAT origin enforcement is intentionally held.
- Live artifact transfer and reparse inspection are not implemented.
- Windows service/session separation and installer/signing remain pending.

## Release-blocking tests

1. stale-generation signed command;
2. replay after guest and host restart;
3. channel key rotation with old-key rejection;
4. guest process crash and heartbeat expiry;
5. Secure Desktop and locked-session input denial;
6. wrong display scaling and dynamic-resolution denial;
7. base VHD remains unchanged after Field use;
8. destruction cannot remove parent or personal-state disks;
9. NTFS junction/reparse escape attempt;
10. artifact changed between verification and copy;
11. credential field and token-bearing UI demonstration;
12. visual deletion and retention expiration;
13. emergency stop during pointer, typing, and file transfer;
14. possible external effect followed by retry request;
15. model request for provisioning, consent, key rotation, deletion, or sensitive export.

## Verdict

The source architecture has strong deny-by-default boundaries and extensive pure/fake tests written. It is not ready for live or production use until executable repository validation and the release-blocking Windows/Hyper-V matrix produce evidence on the exact branch head.
