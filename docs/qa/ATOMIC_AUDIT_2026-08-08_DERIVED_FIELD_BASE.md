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
