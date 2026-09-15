# Correcting an overstated blocker

## What I got wrong

Earlier today I recorded the scene structural budget as a defect that **blocks SCN-001.L2 and L3**,
on the strength of this sentence:

> A single ordinary application window commonly exposes well over a hundred UI Automation elements.

That was an assumption written in the voice of a finding, in a document whose whole point was that
the ceilings had been *measured*. The measured part was right; the part that made it a blocker was
not measured at all. I told the owner to stop before running the session for scene acceptance on
that basis.

## What the measurement says

The shipped `WindowsUiAutomationProvider` was run against a real desktop. Counts only — no titles,
names, values or process names were emitted or logged.

**9 windows, 14 elements.** Raising the requested maximum from 250 to 1,000 changed nothing, so the
observation was not truncated: 14 is all there was. That fits the 34–39 ceiling comfortably.

## Why the assumption was wrong

`ObserveCore` enumerates all top-level windows, but elements come from the **active window's
descendants only** — `selectedWindowId = request.WindowId ?? activeWindow?.Id`. Desktop clutter
does not drive the element count. The complexity of the focused window does.

So the risk is real but conditional: a console or dialog fits easily; a browser or file manager
with hundreds of descendants will be rejected. "Cannot pass" was wrong; "can fail depending on what
has focus" is right.

## What changed

The record is renamed from `OPEN_DEFECT` to `OPEN_RISK`, its severity corrected in place with the
original claim quoted rather than deleted, and the runbook's guidance rewritten — including the
banner that told the owner not to run for scene acceptance. A test named
`ARealisticDesktopDoesNotFit` is now `AComplexFocusedWindowDoesNotFit`, because the old name
asserted the wrong thing in the one place a reader would trust it most.

The measured ceilings, the unreachable constants, and reject-not-truncate all stand unchanged.

## The thing worth keeping

One finding in that document was measured and one was assumed, and they sat in the same list under
the same heading. The measured one held. The assumed one was wrong by enough to change the advice
given to the owner.

A second hazard surfaced while correcting it, and it is the more interesting one: the provider
applies `Take(Math.Clamp(request.MaxElements, 1, 2_000))`. Lowering `MaxElements` to make
observations fit would make every oversize observation **silently partial** — the boundary would
accept it, because it never sees what was dropped. The obvious fix for the budget is the one that
quietly defeats reject-not-truncate.
