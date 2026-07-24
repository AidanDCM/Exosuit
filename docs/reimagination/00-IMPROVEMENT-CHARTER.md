# Exosuit Improvement Charter

## Preservation rule

Exosuit remains an independent ambitious project. It will not be reduced to a submodule of AI Desktop Operating System or merged with Parts & Pieces during this improvement program.

## Product identity

Exosuit should become a universal, safety-first interface between an intelligent controller and an interchangeable software or physical body. The project owns the body protocol, observations, actions, timing, control ownership, telemetry, simulation, and emergency behavior. It does not need to own the reasoning model itself.

## Highest-priority improvements

1. Define precise observation packets including body identity, sequence, time, capabilities, state, sensor readings, controller ownership, confidence, and safety status.
2. Define action packets including capability, parameters, deadline, maximum duration, safety class, cancellation policy, expected feedback, and idempotency.
3. Define controller arbitration for human, agent, shared, supervisor, emergency override, and unowned states.
4. Guarantee that human and emergency controls can override agent control through a lower-level deterministic path.
5. Implement safety states: safe, limited, active, paused, fault, emergency stop, and recovery required.
6. Separate non-real-time, soft-real-time, and hard-real-time operations. Cloud model loops must never be trusted as hard-real-time safety controllers.
7. Build a simulator before real host or hardware control, including cursor, keyboard, robot, and vehicle-like bodies where useful.
8. Simulate command delay, dropped commands, stale observations, sensor noise, conflicting controllers, resource loss, network loss, and emergency stops.
9. Add capability manifests that describe allowed actions, ranges, units, timing, prerequisites, risk, and physical or software constraints.
10. Add telemetry, heartbeat, watchdog, fault reporting, black-box event history, and deterministic shutdown behavior.
11. Create adapter interfaces for desktop, browser, game, mobile, robot, and future bodies without forcing all adapters into the core.
12. Add authorization, ownership transfer, session expiry, and recovery procedures.

## Implementation sequence

1. Replace the minimal README definition with explicit architecture and scope.
2. Define protocol schemas and safety invariants.
3. Build the simulator and deterministic safety controller.
4. Add control arbitration, watchdogs, telemetry, and emergency tests.
5. Create one low-risk software-body adapter.
6. Only after simulation evidence, consider constrained physical adapters.

## Definition of done

A controller can discover a simulated body's capabilities, receive ordered observations, issue bounded actions, yield instantly to a human, survive delayed or missing messages, enter a safe state on fault, record a complete event history, and recover only through an explicit safety process.