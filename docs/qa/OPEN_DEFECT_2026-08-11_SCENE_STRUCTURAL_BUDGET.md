# OPEN DEFECT — the scene path cannot produce a scene from a real desktop

**Found:** 2026-08-11, by measuring the structural budget rather than assuming it.
**Status:** open. Not fixed — the fix is a design decision, not a repair.
**Severity:** **SCN-001.L2 and L3 cannot pass.** The producer would be rejected on every cycle.

## The measurement

Element ceilings, measured against `FieldSceneProducerBoundary.Create` with field widths a real
desktop produces:

| Windows | Maximum elements that fit |
|---|---|
| 1 | **39** |
| 3 | **38** |
| 5 | **37** |
| 10 | **34** |

Cost is roughly **290 bytes per element**. One window with ten elements is 3,657 bytes of the
12,288 available.

## Why this blocks the session

A single ordinary application window commonly exposes well over a hundred UI Automation elements.
A desktop with a browser, an editor, and a file manager is in the hundreds.

The boundary **rejects rather than truncates** — deliberately, and correctly: a silently truncated
scene is a partial view of the desktop that looks complete, and acting on one could target the
wrong control. The consequence is that oversize means *no scene at all*, not a smaller scene.

So on a live guest: the producer observes, the boundary throws, the loop ends, the supervisor
relaunches, and the next observation fails identically. L2 never sees a scene. L3 — a scene large
enough to chunk — is unreachable by construction, because nothing that large can ever be produced.

## A second, smaller incoherence

`FieldSceneProviderObserver` builds `new ObservationRequest(IncludeScreenshot: false)`, whose
`MaxElements` defaults to **250**. `FieldSceneProducerBoundary.MaximumElements` is **128**. The
producer therefore asks for roughly twice what the boundary would ever accept.

It is moot in practice — 128 is itself unreachable, by about a factor of three — but it means the
declared constants describe a scene the system cannot carry. A reader of `MaximumElements = 128`
would reasonably believe a 128-element scene is supported. It is not.

## Why this is not fixed here

Every available fix changes what a scene *means*, which is the owner's call:

1. **Raise the budget.** `WriteEnvelope` already chunks and caps at 16,000 characters, and the KVP
   reassembly path is tested across all three implementations, so a larger scene is transportable.
   But 12 KiB is a policy bound, not a transport one, and raising it widens what a compromised
   guest can push at the host per cycle.
2. **Capture less.** Observe only the active window's elements rather than the whole desktop. This
   fits comfortably, and it changes what "scene" means — the host would no longer see the desktop,
   only the focused window. Whether that is sufficient for M2 actions is a product decision.
3. **Truncate with an explicit partial-view marker.** Keeps whole-desktop scenes but requires the
   payload to carry "this is incomplete" and the host to refuse to act on a partial scene for
   anything but the elements it can see. That is new contract surface on both sides.

Option 3 is the only one that preserves both whole-desktop coverage and safety, and it is the most
work. Option 2 is the smallest change that produces a working scene today. Option 1 alone does not
solve it — at 290 bytes per element, even 64 KiB caps out near 220 elements, and a busy desktop
exceeds that.

## What is pinned meanwhile

`FieldSceneStructuralBudgetTests` records the measured ceilings, asserts that the declared
collection limits are unreachable, and asserts that the boundary rejects rather than truncates.
If the payload shape, the field set, or the budget changes, the numbers move visibly rather than
surfacing as a live session that produces nothing.

## Reproduction

```
dotnet test --filter FullyQualifiedName~FieldSceneStructuralBudgetTests
```
