# Level 4 audit — Field development auto-login

**Date:** 2026-07-24  
**Depth:** Level 4 — guest identity and local authentication

## Boundary

Development auto-login is an explicit non-production Field provisioning mode. It is not enabled by model output, guest content, or an unsigned seed file.

## Controls

- signed plan field and separate explicit host apply switch are both required;
- isolated networking only;
- personal-state disk forbidden;
- generated account is a standard member of the built-in Users group;
- existing accounts are never modified;
- password has at least 24 characters and is stored for auto-login through LSA private data;
- guest seed copy is overwritten and removed after setup;
- production readiness requires `developmentAccessEnabled: false`;
- exact-generation destruction remains the supported cleanup.

## Residual risk

Automatic login deliberately reduces local guest-console protection. Deleted seed bytes may remain recoverable in the disposable differencing disk. Host administrators can access host-held credentials. These risks are accepted only for synthetic development generations with no personal state and no non-isolated network.

## Verdict

Acceptable for bounded development validation after live proof. Forbidden for production, owner data, personal-state disks, NAT-connected guests, and release evidence that claims production-equivalent authentication.

The source validation matrix passed: typecheck, build, 239 TypeScript tests, 44 .NET tests, and both full-chain system pulses.
