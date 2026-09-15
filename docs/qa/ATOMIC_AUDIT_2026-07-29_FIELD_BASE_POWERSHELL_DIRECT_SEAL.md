# Level 4 audit — Field base PowerShell Direct seal

**Scope:** execution-sensitive Windows base maintenance and sealing authority  
**Verdict:** source guard PASS; live v19 proof pending

## Live evidence that triggered the change

The v18 base was built from exact commit `66e416a884eeb6d899105602dc6d7d811cabec6f`, independently hashed, promoted read-only, and carried bound SYSTEM and Audit receipts. A fresh isolated v18 Field nevertheless displayed Windows Setup's terminal installation-cannot-proceed dialog before any authenticated KVP.

Read-only offline inspection proved:

- the Exosuit development account and secure auto-logon configuration existed;
- no plaintext development password value remained;
- the canonical LocalSystem automatic guest service existed;
- SetupComplete and guest bootstrap had not run;
- Windows remained in setup phase 4 and `IMAGE_STATE_UNDEPLOYABLE`;
- the canonical Sysprep run created `Sysprep_succeeded.tag` and requested shutdown;
- ten seconds later a second Sysprep run parsed `/REBOOT`, deleted the success tag, and displayed its UI;
- deployed specialize later failed at `Setup\Sysprep\OfflineState\Specialize` with Win32 error 19.

This is negative evidence. v18 is not guest-ready and must not be repaired in place or promoted as usable.

## Authority review

The new split preserves:

1. SYSTEM owns destructive maintenance and produces the maintenance receipt.
2. The built-in Audit administrator owns Sysprep.
3. The host owns orchestration and supplies a one-use credential over PowerShell Direct.
4. The seal requires the exact automatic Audit UI process and terminates no other process shape.
5. The final receipt is bound to the SYSTEM receipt digest and the exact audit-seal script digest.
6. The canonical command remains `/generalize /oobe /shutdown /quiet`.

## Deny-by-default properties

- Bootstrap no longer contains a Sysprep launch.
- SYSTEM maintenance rejects unattended files containing `RunSynchronous` and requires the PowerShell Direct marker.
- Missing, duplicate, non-canonical, or differently-argued Sysprep processes stop sealing.
- Wrong principal, missing receipt, digest mismatch, network attachment, personal configuration, unexpected accounts, or noncanonical guest service stop sealing.
- No network listener, broad mount, credential logging, full-control enablement, or approval automation was added.

## Automated evidence

- PowerShell parse: pass for both scripts.
- Focused Windows script contract: 8/8 pass.
- Full repository gate: pass. Repository, master-plan, and Field validators; typecheck; 314/314 TypeScript tests; build; both system pulses; and 48/48 .NET tests passed.
- Exact-head clean-checkout gate remains required after commit and before live v19 promotion.

## Live promotion requirements

v19 remains unapproved until one clean run captures:

- immutable v10 donor digest;
- one-use credential creation and consumption without logging its value;
- PowerShell Direct maintenance and seal stages;
- automatic Audit UI termination receipt;
- SYSTEM-to-Audit receipt hash binding;
- powered-off maintenance VM;
- read-only target and independently recomputed digest;
- fresh Field first boot without the Windows Setup error;
- authenticated bootstrap, heartbeat, identity, display, policy, and attestation.

## Rollback

Revert the source slice and leave v19 absent. Preserve v18 as negative evidence.
