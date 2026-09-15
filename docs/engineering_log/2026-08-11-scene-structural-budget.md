# The scene budget, measured

- **Goal:** stop guessing whether a real observation fits the 12 KiB structural bound. It was the
  top item on the runbook's failure-prediction list, written as "unknown".
- **Outcome:** it does not fit, by roughly a factor of three, and the shortfall blocks SCN-001.L2
  and L3. Measured rather than predicted.
- **Files changed:** `FieldSceneStructuralBudgetTests` (new), an open-defect record, the runbook,
  this log. **No source change** — the fix is a design decision.

## What was measured

| Windows | Maximum elements that fit |
|---|---|
| 1 | 39 |
| 3 | 38 |
| 5 | 37 |
| 10 | 34 |

About **290 bytes per element**. One window with ten elements uses 3,657 of 12,288 bytes.

A single ordinary application window commonly exposes well over a hundred automation elements, so
the first real observation is rejected, and so is every one after it. The producer loop ends, the
supervisor relaunches, and the next observation fails identically.

## The declared limits are unreachable

`MaximumElements = 128` and `MaximumWindows = 32` can never be reached — the byte budget rejects
first, always. A reader of those constants would reasonably conclude a 128-element scene is
supported. It is not, by about a factor of three. That is now asserted rather than left to be
inferred.

Separately, `FieldSceneProviderObserver` requests `MaxElements` at its default of **250**, roughly
twice what the boundary would ever accept. Moot in practice, but it means the constants describe a
scene the system cannot carry.

## Why nothing was fixed

Every available fix changes what a scene *means*:

- **Raise the budget** — transportable, since `WriteEnvelope` already chunks to 16,000 characters
  and reassembly is pinned across all three implementations. But 12 KiB is a policy bound, not a
  transport one, and raising it widens what a compromised guest can push per cycle. At 290 bytes
  per element, even 64 KiB caps near 220 elements, which a busy desktop still exceeds.
- **Capture less** — observe only the active window. Fits comfortably today; changes "scene" from
  the desktop to the focused window, which is a product decision about what M2 actions need.
- **Truncate with an explicit partial-view marker** — preserves whole-desktop coverage and safety,
  requires new contract surface on both sides, and is the most work.

The boundary rejecting rather than truncating is correct and should stay: a silently truncated
scene is a partial view that looks complete, and acting on one could target the wrong control. The
cost of that correctness is that oversize means no scene at all.

## What is pinned meanwhile

The measured ceilings, the unreachability of the declared limits, the realistic-desktop case, and
the reject-not-truncate behaviour. If the payload shape, field set, or budget changes, the numbers
move visibly instead of surfacing as a live session that produces nothing.

## Results

- Agent suite **281/281**.
- `validate:repository`, `validate:field-contract` pass.
- Gate unchanged: SCN-001 `source_validated`.

## Note on the prediction list

This was item 0 on the runbook's list, written the same day as "element counts are unknown". It
took one measurement to turn it into a number, and the number is disqualifying. Predictions on that
list are cheap to write and cheap to check; the others deserve the same treatment before the
session rather than during it.
