# Level 4 Addendum: Field Service Command Normalization

**Date:** 2026-07-28

**Verdict:** live defect isolated; narrow source repair acceptable; base promotion still denied

## Safety question

Does accepting Windows' unquoted persistence of a no-space executable path permit a different executable, argument, identity, or service mode?

## Evidence

The v15 staging VM was validated against its exact disk binding and zero-network contract, stopped after the bounded maintenance timeout, and mounted read-only. Sanitized evidence records the last stage as `components_verified` and classifies the private maintenance log as `runtime_service_contract_mismatch`. Fixed-category offline SYSTEM-hive inspection reports the exact unquoted canonical command, LocalSystem object name, automatic start value, own-process type, configured failure actions, and failure actions on non-crash failures. No raw guest logs, registry values outside the reviewed service, private UI text, credentials, or secrets were exported.

## Controls

- The verifier accepts exactly two complete strings.
- Both strings name `C:\Exosuit\Agent\Exosuit.Agent.exe` and the sole fixed `--field-guest-service` argument.
- Quotes are optional only around that no-space canonical executable path.
- LocalSystem and automatic-start checks remain independent and exact.
- Installation still removes the legacy task and configures bounded recovery.
- Base promotion still requires authorization consumption, a matching receipt, Sysprep shutdown, digest verification, and a read-only target.

## Hold

v15 remains unpromoted negative evidence. Production and live readiness remain denied until a fresh base completes the one-use receipt contract and a fresh disposable generation passes bootstrap, enrollment, authenticated KVP readiness, graceful reboot, hard-stop recovery, and independent emergency stop.

## Rollback

Revert the three verifier changes and destroy the unpromoted staging generation. No immutable base or live Field depends on this repair.
