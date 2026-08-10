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
10. local build scheduler to owner-installed Field lifecycle service.

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
| Build scheduler expands lifecycle authority | owner-installed expiring policy; only provision/authenticated read-only observe/destroy; exact generation; fixed hash-bound scripts/config/observer; no command/path/MCP field | .NET policy/job/command tests and PowerShell static tests | installed-service queue, ACL, tamper, replay, cancellation, and lifecycle acceptance |
| Privileged service becomes a general shell | no executable/argument/script field; command factory chooses fixed scripts and derives confirmations; prompt suppression is accepted only by those scripts under LocalSystem after exact typed confirmation | source/static tests | process-monitor observation on installed service |
| Command tampering | HMAC-SHA256 envelope, payload hash, key ID, expiration | TS/.NET tests and shared fixture | actual transport fault injection |
| Replay or reordering | compiled snapshot verification checks message ID, nonce, strictly increasing sequence, expected message types, and an atomic HMAC-protected KVP ledger that permits only exact retained-record rereads after fresh cryptographic/expiry verification | replay/restart tests in both languages; v21 compiled-agent restart and negative live evidence; protected-state corruption/key/generation unit tests; v22 live copy-based protected-state corruption/cross-binding and recovery | actual stale-generation replacement and owner-authorized key rotation |
| Cross-generation action | every channel, heartbeat, command, scene, artifact, episode, and visual reference binds Field generation | unit tests | stale live process and rollback tests |
| Valid CHN candidate lacks real-time lifecycle attestation | retrospective evidence could be confused with a live generation/boot | CHN recorder requires exact signed created VM/base, heartbeat inside a signed boot window, and terminal destruction; no import or backdating path | new live G2 acquisition and recording |
| Real-time CHN lifecycle signing dirties the tracked evidence ledger | an all-files clean-tree check makes a post-attestation heartbeat impossible, encouraging backdating or hidden state | acquisition permits only an append-only, fully signature-verified lifecycle diff for the active exact Field/generation/machine; committed prefix and exact HEAD remain immutable; every other tracked diff fails closed | CHN lifecycle-append unit/adversarial tests and fresh G3 live acquisition |
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
| Session-0 process claims interactive scene | producer refuses LocalSystem and requires its actual process session to equal the configured positive Windows session; receiver also binds boot/agent/session | producer/receiver unit tests | session-local launcher/relay W/H |
| Scene payload leaks UI text or screenshots | producer strips title/name/value/provider-warning text and sensitive automation authority; both sides forbid screenshots; receiver accepts only the fixed sanitization warning | producer/receiver unit tests | guest producer leakage inspection W/O |
| Oversized/replayed/regressing scene | producer enforces collection limits and 12 KiB serialized payload with no truncation; receiver repeats byte/count bounds and durable replay checks | producer/receiver unit tests | long-running backpressure/restart W/H |
| Service-session identity reused as interactive proof | roadmap/boundary distinguish v1 session-0 bootstrap evidence from per-boot interactive session/user/client identity; relay rejects zero/wrong session; resolver derives client PID/session/token SID from Windows | relay/resolver unit and local-pipe tests | live SYSTEM W/H |
| Interactive client asks SYSTEM to sign altered scene | relay matches PID/session/SID/fixed path/digest, strictly reparses, reruns structural normalization, requires canonical equality, then signs with ten-second TTL | relay unit tests | secured pipe/client-process race W/H |
| Attacker substitutes claimed pipe-client facts | resolver ignores payload claims and obtains PID from the connected pipe, session/path from the process, SID from its token, and digest from an opened image | local Windows pipe test | production pipe ACL, PID-reuse/process-exit race, and installed-file ACL W/H |
| Guest runtime starts during Windows specialize | sealed base stages service Manual; SetupComplete alone changes it to Automatic and starts it | source/static contract plus v20/v21 SYSTEM/Audit receipts and authenticated development canaries | production-authenticated repeated lifecycle matrix |
| Protection command and launcher receipt schemas drift | exact six-property serialized schema plus cross-layer compiled/launcher contract; mismatch denies before emitter | v23/v24 negative live diagnosis and source tests | rebuilt-image authenticated KVP and restart matrix |
| Diagnostic privacy leak | Field support bundle accepts only hashes and aggregate counts; forbidden fields/values | tests | support bundle manual inspection |
| Emergency-stop failure | recovery marks release blocking and denies automated recovery | tests | physical end-to-end stop test |

## Security invariants

- A pilot/model has no Field administration authority.
- A policy, consent, channel key, or attestation cannot be created by model text.
- Every mutable action is tied to one Field generation and one current scene version.
- Live channel replay state is bounded, atomically persisted, and bound to exact Field generation, direction, and key ID; corrupt or mismatched state fails closed.
- Retained Hyper-V KVP records are observations, not re-executed commands: exact
  envelope digest/message/sequence rereads are idempotent only after fresh
  authentication and expiry checks; any changed record must advance strictly.
- A locked session does not grant readiness or action authority. After initial
  bootstrap and exact protected-secret receipt validation, the guest may report
  authenticated non-ready/provisioning state while bootstrap refreshes. Timeout
  or early exit stops the exact child. Source harness evidence passes; rebuilt-
  base lock/Secure Desktop evidence remains pending.
- Signed channel timestamps use one canonical UTC representation with exactly millisecond precision.
- Structural scene messages use the authenticated channel sequence as their scene version and bind exact boot, agent, and interactive Windows session identity. The contract is not a live producer and grants no execution authority.
- Field policies authorize canonical origins and reviewed executable name/hash identities, not arbitrary URLs or process-name strings.
- No Field command accepts arbitrary shell or PowerShell strings.
- The guest does not control the host cursor as its primary architecture.
- The base image is immutable; the boot writer is a disposable child overlay.
- The task disk is disposable and distinct from the OS overlay and personal state.
- Writable personal state is bound by a stable disk ID and monotonic generation. Whole-file hashes identify only sealed immutable snapshots, never the active writable VHDX.
- Host clipboard, broad drive mapping, and host input injection remain disabled.
- Teach and Shadow inject no input.
- Visual bytes are never embedded in demonstration metadata.
- Sensitive and untrusted files cannot use the ordinary export path.
- Unknown or uncertain effects stop or reconcile; they do not retry blind.
- Emergency stop remains independent of pilot success.

## Residual risks

- HMAC attestation is local software binding, not hardware-rooted remote attestation.
- Replay state has bounded atomic persistence and the KVP observation ledger has an HMAC-protected, Field/generation/key-bound envelope. A transactional owner-only rotation coordinator has fake-provider reconciliation/rollback and old-key rejection tests; its metadata store is atomically HMAC-protected and generation-bound. A bounded Windows primitive adds LocalMachine DPAPI plus an exact SYSTEM/Administrators DACL for channel-secret bytes and is used by the explicit conversion command and guest reader. A SYSTEM-only conversion transaction has source tests for confinement, corruption denial, atomic replacement, and idempotent exact-binding verification. Its fixed CLI requires literal runtime-config location, LocalSystem-before-read, strict bounded unambiguous configuration, exact derived binding, and metadata-only output. The fixed launcher invokes it before the guest KVP emitter and validates an exact Field/generation/key/status/digest/freshness receipt; the emitter then uses a protected-only reader with no plaintext fallback. A Windows PowerShell subprocess harness proves converted/already-protected continuation and nonzero/malformed/no-receipt fail-before-emitter behavior through inert process adapters, without a production injection switch. Combined guest execution, configuration/secret ACL and TOCTOU resistance, real startup process faults, managed-string retirement, host protected-key storage, forensic seed erasure, and the host/guest ceremony are not proven live.
- Hyper-V KVP provides the existing bounded guest-to-host metadata transport;
  CHN-001 now has a fail-closed acceptance schema, but its complete production
  failure-injection matrix remains unexecuted. No general Hyper-V socket or
  bidirectional command transport is claimed.
- The CHN-001 acquisition driver binds a clean exact commit, production plan,
  protected runtime configuration, running VM GUID, immutable base digest, and
  compiled authenticated snapshot observer. It content-addresses imported ceremony
  artifacts and independently checks cleanup/base immutability at finalize, but it
  cannot prove the truth of owner-observed lock, Secure Desktop, display, or stop
  ceremonies without their reviewed live artifacts and independent review.
- Component-only base derivation mounts only a temporary copy of an accepted,
  generalized read-only image and confines writes to fixed guest component paths. It
  denies overwrite and per-generation config and rolls back the exact derived copy;
  live elevated derivation, source immutability, target boot, and acceptance remain
  required before the new image may enter a production plan.
- The guest Windows agent is not yet wired to the new command/channel modules.
- No real visual sensor or input hook exists, so privacy behavior is not live-tested.
- Personal-state encryption ownership and key rotation are not implemented.
- Filtered NAT origin enforcement is intentionally held.
- Live artifact transfer and reparse inspection are not implemented.
- Windows service/session separation and installer/signing remain pending.

## Release-blocking tests

1. stale-generation signed command;
2. replay after guest and host restart;
3. live channel-key rotation with protected storage, crash reconciliation, and old-key rejection;
4. guest process crash and heartbeat expiry;
5. Secure Desktop and locked-session input denial;
6. wrong display scaling and dynamic-resolution denial;
7. base VHD remains unchanged after Field use;
8. destruction cannot remove parent or personal-state disks;
9. NTFS junction/reparse escape attempt;
10. artifact changed between verification and copy;
11. credential field and token-bearing UI demonstration;
12. visual deletion and retention expiration;
13. emergency stop during pointer, typing, and file transfer after live execution exists;
14. emergency stop during active consented recording after live Teach hooks exist;
15. possible external effect followed by retry request;
16. model request for provisioning, consent, key rotation, deletion, or sensitive export.

## Verdict

The source architecture has strong deny-by-default boundaries and extensive pure/fake tests written. It is not ready for live or production use until executable repository validation and the release-blocking Windows/Hyper-V matrix produce evidence on the exact branch head.
