# OPEN RISK — the scene budget can reject a complex focused window

**Found:** 2026-08-11. **Severity corrected the same day after measuring a real desktop.**
**Status:** open. Not fixed — the fix is a design decision, not a repair.
**Severity:** conditional. Depends on which window is focused. **Corrected 2026-08-11 — see below.**

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

## Correction — the original severity claim was wrong

The first version of this document asserted that "a single ordinary application window commonly
exposes well over a hundred UI Automation elements" and concluded that L2 and L3 **cannot** pass.
That was an assumption presented as a finding. It was then measured.

**Measured on a real desktop, via the shipped `WindowsUiAutomationProvider`: 9 windows, 14
elements.** That fits the budget comfortably. Requesting up to 1,000 elements changed nothing, so
the observation was not truncated — 14 is the whole of it.

The mechanism was misunderstood. `ObserveCore` enumerates **all top-level windows**, but elements
come from the **active window's descendants only** — never the whole desktop. So desktop clutter
does not drive the element count; the complexity of the *focused window* does.

That makes the risk conditional rather than certain:

- A simple focused window — a console, a small dialog, an editor — fits easily.
- A complex focused window — a browser, a file manager, a data-heavy application — can have
  hundreds of descendants and will exceed the budget.

The ceilings below stand: they were measured and are correct. What was wrong was the claim about
what a real observation contains.

## What still matters

The boundary **rejects rather than truncates** — deliberately and correctly, since a silently
truncated scene is a partial view that looks complete and acting on one could target the wrong
control. So when the budget is exceeded, the result is no scene at all, and the producer loop ends
and is relaunched into the same failure for as long as that window stays focused.

There is also a truncation path that is easy to miss: the provider applies
`Take(Math.Clamp(request.MaxElements, 1, 2_000))`. Lowering `MaxElements` to fit the budget would
make every oversize observation *silently partial* — the boundary would accept it, because it never
sees what was dropped. That is the option-3 hazard arriving through the back door, and it is why
the `MaxElements` default of 250 against a 128 constant against a ~35 real ceiling is worth fixing
deliberately rather than by lowering a number.

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
