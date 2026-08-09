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

The remediated transaction completed on 2026-08-09 against exact source commit
`99217dac4b7eee51458a61843a6c372336ce13ec`. Its receipt records v26 digest
`19a1c58fc1585fbde9a5325746c6ff1442964e471a5dcf6a46bc1a237e8fc1cf`, read-only
publication, no network attachment, no writable source mount, no per-generation
configuration, and hardened component ACLs. Independent post-run hashing reproduced
both the v25 and v26 receipt digests and found no temporary building image. These facts
authorize disposable v26 acceptance testing; they do not themselves prove a guest boot,
channel readiness, lifecycle cleanup, or CHN-001.
