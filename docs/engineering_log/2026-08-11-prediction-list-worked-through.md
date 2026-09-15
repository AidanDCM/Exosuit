# Working through the failure-prediction list

The runbook listed five things most likely to break first, written from what was untested. Two
were checkable at a desk. This is what they turned into.

## Item 3 — producer image path: a silent trap, now fixed

`FieldSceneRelayBoundary` pins `ProductionAgentPath` to `C:\Exosuit\Agent\Exosuit.Agent.exe` and
rejects any policy naming a different path. `FieldSceneSessionConfiguration.Validate` only checked
the path was non-empty, and **nothing tied the two together**.

So an owner authoring a session with the producer installed anywhere else — a test build, a
different drive — would have seen the authoring command succeed, the digest compute correctly, the
launcher start the process, the producer connect to the intake, and then **every scene rejected at
the relay**. The failure would appear three layers from its cause, during the live session.

The session configuration now checks the path the relay actually demands, so a wrong path is
refused when the session is authored. A test asserts the production rule with no override, so the
real constraint is the one under test.

This required a seam: `Validate`, `ReadOptional` and `Author` take an optional expected path
defaulting to the relay's constant. Production callers never pass it; tests do, because otherwise
exercising any other rule would require installing a binary at the production location. The seam
is the smallest thing that keeps the production rule real and the rest testable.

## Item 2 — Hyper-V exchange reader: half-resolved against real Hyper-V

The CIM class names and association traversal were "taken from the existing PowerShell script
rather than observed". The query is read-only, so it was run against this host.

**Confirmed correct:** the namespace `root\virtualization\v2`, the class `Msvm_ComputerSystem`,
and the `ElementName`/`Caption` filter. The query matched exactly one VM — the legacy G4 Field —
and the "exactly one" guard behaves correctly, failing closed with the intended message for a name
that does not exist.

**Still unproven:** the association to `Msvm_KvpExchangeComponent` returned zero instances, because
that VM is `EnabledState 3` — off. The component is only associated while a VM is running. So the
traversal is neither confirmed nor refuted; it simply cannot be exercised without a running VM.

That is a genuine narrowing. The part most likely to be wrong — namespace and class names, which
are easy to mistype and impossible to guess — is now verified. What remains is one association
that a running guest will settle in seconds.

## Items 1, 4, 5 — not checkable here, and why

- **`WindowsFieldSceneSessionPorts`** needs `CreateProcessAsUser` across a real session boundary, a
  real producer connecting, and a real registry write. An in-process end-to-end is blocked by the
  relay's own path pin: the test binary is not at the production agent path, so the relay would
  correctly refuse it. The pin is right; it just makes this untestable at a desk.
- **Poll cadence** cannot be judged without knowing how long a real observation takes.
- **The pipe ACL under a real cross-session client** needs two interactive sessions. The minimal
  right set was measured as the same user; SYSTEM serving a different user is a different case.

## Results

- Agent suite **282/282**.
- `validate:repository`, `validate:field-contract` pass.
- Gate unchanged: SCN-001 `source_validated`.

## What the list is worth

Five predictions. One was already disqualifying when measured (the structural budget). One was a
silent trap that is now fixed before it could waste a session. One is half-resolved. Two need the
guest. Written as a list of "unknowns" they all looked equivalent; checked, they were not.
