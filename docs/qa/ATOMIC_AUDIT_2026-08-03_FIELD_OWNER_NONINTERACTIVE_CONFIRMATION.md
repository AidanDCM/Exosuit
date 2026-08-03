# Atomic Audit — Field Owner Noninteractive Confirmation

**Date:** 2026-08-03
**Depth:** Level 4 privileged lifecycle invocation
**Status:** source repair; installed lifecycle retest pending
**Master-plan phase:** L1

## Finding

The installed LocalSystem owner service reached the fixed destruction script, but
Windows PowerShell 5.1 treated the native `-File` argument `-Confirm:$false` as a
string and rejected conversion to `SwitchParameter`. The command failed before the
script body and before any Hyper-V or filesystem mutation.

## Repair and authority analysis

The command factory no longer sends a value-bearing common switch. It sends the fixed
`-OwnerPolicyAuthorized` flag to the two fixed lifecycle scripts. Each script accepts
that flag only when its current Windows SID is LocalSystem and only after validating
the exact typed Field ID/generation confirmation. It then sets `ConfirmPreference` to
`None` for its existing `ShouldProcess` calls.

The queue still cannot choose a script, argument name, command, policy, storage root,
consent, key, recording operation, export, or target path. Non-SYSTEM direct callers
cannot use the flag. Ordinary direct elevated use retains the existing confirmation
behavior unless the caller is LocalSystem and supplies the exact typed confirmation.

## Failure behavior, privacy, and rollback

The observed failure produced bounded stderr and a terminal failed result. The exact
generation root remained intact, and the retirement batch stopped before later targets.
No secret or private UI data entered the result. Rollback is to revert this slice and
reinstall the prior hash-bound service/scripts; that restores safe denial but also
restores the PowerShell 5.1 invocation failure.

## Required evidence

- focused .NET and Windows script tests;
- repository validators and exact-head validation;
- one reviewed service upgrade;
- successful exact-generation destruction and provisioning through the service;
- unchanged base-image digests and confined generation removal.

## Subsequent fixed-dependency finding

After the confirmation repair was installed, destruction succeeded but provisioning
failed before mutation because its fixed sibling `Test-ExosuitFieldHost.ps1` had not
been installed. The exact generation root remained absent. The installation plan,
policy contract, installer copy/verification set, and service startup digest validation
now include that script. This adds no selectable command or job input; it closes the
fixed provisioning dependency under the existing hash-bound authority.
