# Level 4 atomic audit: derived immutable Field base

## Verdict

Source design only. Live image acceptance remains denied.

The derivation script verifies a clean exact commit, immutable source digest, unique
target, fixed image root, fixed guest components, absent generation config, component
digests, and non-writable untrusted ACLs. It mounts only the temporary copy, has no VM
or network operation, publishes after dismount/hash/read-only marking, and confines
rollback to the exact new copy.

The source image, personal state, task disks, policies, keys, recording, input, and MCP
surfaces are outside the mutation set. A receipt cannot substitute for boot/guest/
lifecycle acceptance. Any non-component update must use the full Sysprep ceremony.

The first elevated run rejected inherited v25 ACLs before publication because an
untrusted principal retained write rights. Rollback removed the temporary copy and left
no v26 target. Derived components now receive an exact SID-based ACL: LocalSystem and
Administrators Full Control; Users Read & Execute. Any remaining untrusted write/create
right still fails closed before dismount/publication.
