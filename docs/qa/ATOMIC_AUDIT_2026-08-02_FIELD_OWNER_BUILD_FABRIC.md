# Atomic Audit — Field Owner Build Fabric

**Date:** 2026-08-02
**Depth:** Level 4 authority and privileged-execution boundary
**Status:** source and local-test review; installation/live lifecycle evidence pending
**Master-plan phases:** L1-L3 foundation and L16 reliability tooling

## Boundary introduced

This slice adds a distinct host-side LocalSystem service authority. It is not the
Glove, guest agent, pilot, MCP gateway, or Field policy issuer. An owner-approved
installation creates an expiring standing policy. The service may execute only:

- `provision` for an exact Field ID/generation through the fixed provisioning script;
- `observe` for authenticated read-only KVP verification through a fixed compiled
  observer and fixed observation script;
- `destroy` for the exact disposable Field generation through the fixed destruction
  script.

No job field can name a command, executable, script, host configuration, storage root,
evidence root, policy, consent, recording action, key action, export, mode, or desktop
operation. The service has no MCP or network listener.

## Authority analysis

- **Environment authority:** the local Field service executes lifecycle effects under
  an owner-installed standing policy.
- **Glove authority:** unchanged. The service cannot propose or execute desktop input.
- **Pilot authority:** unchanged and denied for Field administration. A build-scheduler
  submission is data; the service validates it against local policy before effect.
- **Policy expansion:** impossible through the queue. Policy replacement requires a
  new elevated installation.
- **Consent/recording:** unavailable. No recording can start through this service.
- **Keys:** the service cannot create or rotate keys. Observation temporarily consumes
  a caller-supplied host verification secret from an exact package and does not emit it.

## Identity and generation

Every job binds policy ID, job ID, exact Field ID/generation, exact source head,
creation/expiry, operation, and operation-specific input digests. Provisioning also
rechecks plan identity. Observation rechecks runtime Field identity and confines the
runtime secret path to the claimed processing package. Destruction derives its typed
confirmation from the exact job identity. Rebuild or rollback must use a new generation;
stale jobs fail the freshness/generation checks and never gain carry-forward authority.

## Filesystem and storage

- Installed binaries/scripts/configuration: administrator/SYSTEM writable only.
- Pending queue: owner SID may submit atomic packages; policy is not writable there.
  Publication becomes visible only when the owner writes the fixed `.ready` marker last;
  LocalSystem performs the atomic claim rename. Unready GUID directories are ignored.
- Results and sanitized installation evidence: the exact owner SID has inherited
  read/execute access only; it cannot modify service results or evidence.
- Installed policy: the exact owner SID may read only this public contract so the
  non-elevated submitter can bind policy ID and operation scope; the adjacent host
  configuration remains protected.
- Processing packages: the service atomically claims the submitted name, then copies
  bounded regular files through exclusive handles into a fresh protected job-ID
  directory. It never executes from the submitter-writable tree. Unexpected entries,
  nested seed directories, oversized inputs, sharing violations, and reparse points deny.
- Consumed package removal: confined to the exact processing job directory after a
  terminal result. This removes active namespace access but does not claim forensic
  secure erasure.
- Immutable base: unchanged; the existing provisioning script verifies digest and
  creates a disposable differencing overlay.
- Personal state: not a service deletion target.
- Task/runtime disks: remain confined to the existing exact generation root.

## Failure and stop behavior

- Session lock or Secure Desktop: observation may report non-ready/deny through the
  existing authenticated contracts; the service grants no input authority.
- Heartbeat loss or missing handshake: observation fails; no blind retry or readiness
  claim is generated.
- Replay/stale/future/wrong-policy job: deny before process start.
- Package overflow/reparse/unexpected file: deny before process start.
- Active-Field capacity: deny provisioning.
- Service stop: cancellation kills the exact lifecycle process tree. This does not
  replace the independent Glove/physical emergency stop.
- Any exception after lifecycle process start records `effect_uncertain` and
  `reconcile_before_retry`; the terminal job ID prevents blind resubmission.
- Uncertain provisioning effect: existing provisioning evidence and rollback result
  remain authoritative; production promotion still requires reconciliation testing.

## Privacy review

The queue may briefly contain a guest seed or host verification secret under local ACLs.
The service does not serialize secret values into results. Lifecycle stdout/stderr is
bounded and must remain secret-free under the fixed scripts. No screenshot, window text,
document content, email, demonstration bytes, or raw UI values are accepted. Live review
must inspect ACLs, process command lines, evidence, pagefile/crash behavior, and package
cleanup before production use.

## Required evidence before promotion

1. exact-head repository and .NET gates;
2. one-UAC installation receipt and service identity/configuration inspection;
3. installed file digest-tamper denial;
4. queue ACL and policy replacement denial from a non-elevated process;
5. stale, replay, wrong-policy, wrong-generation, unexpected-file, and reparse jobs;
6. exact provision, authenticated observation, cancellation, and destruction;
7. base digest unchanged and exact generation root removed;
8. service uninstall confinement and preserved sanitized evidence;
9. physical emergency stop remains effective without the service.

Until these pass, this is a source and installation foundation only. It does not promote
L1, L2, L3, Teach, Shadow, Pilot, MCP acceptance, or production.
