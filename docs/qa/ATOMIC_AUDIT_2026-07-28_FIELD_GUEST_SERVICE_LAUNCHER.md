# Level 4 Addendum: Field Guest Service Launcher

**Date:** 2026-07-28

**Verdict:** source/static pass; live service acceptance pending

## Safety question

Does replacing Task Scheduler with SCM broaden persistent LocalSystem authority or create an alternate path around bootstrap policy?

## Controls

- The service name and mode are fixed in the executable.
- Service startup rejects every identity except local SYSTEM.
- The child executable, script, working directory, configuration path, and arguments are compile-time fixed.
- Shell execution, command interpolation, model input, and network input are absent.
- The existing bootstrap remains the only route to the KVP runtime and continues to fail closed.
- Service stop and shutdown terminate the entire child process tree.
- SCM recovery uses fixed delays and merely reruns the same bootstrap checks.
- Installation removes the legacy scheduled task to prevent duplicate runtime instances.
- Base sealing verifies automatic LocalSystem registration and exact binary path before Sysprep.

## Hold

Production and live readiness remain denied until a fresh disposable generation proves service installation, first enrollment, authenticated readiness, graceful reboot, hard-stop recovery, and independent emergency stop.

## Rollback

Stop/disable the service, destroy the disposable generation, and revert the slice before building another immutable base.
