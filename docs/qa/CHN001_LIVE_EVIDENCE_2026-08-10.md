# CHN-001 live evidence and independent review — 2026-08-10

## Decision

CHN-001 passed for the M1 authenticated-channel and exact-Field emergency-stop scope.
The accepted evidence is `chn001-run-407a194c9685`, artifact SHA-256
`407a194c968525e33d465d6734dd28abde1975783d821d21167ee68314a9fd44`.
Independent reviewer `root:chn001_independent_review` approved the exact candidate
with role `technical_review`. This is not owner acceptance and grants no credit to
Scene, Action, Teach, Shadow, recording-stop, Pilot, MCP, or production gates.

## Exact live boundary

- Source commit: `48b50719559a4849be2c8613153b0ee81cc92470`.
- Machine: `machine-9c62d678dd970f15`.
- Field: `4401b702-334f-475e-b867-b7d06798443d`, generation 3.
- VM GUID: `b538709f-9eda-4696-a40b-ffc14de3dd58`.
- Immutable base digest: `19a1c58fc1585fbde9a5325746c6ff1442964e471a5dcf6a46bc1a237e8fc1cf`.
- Accepted boot: `29a19dbc-5021-4dc3-8979-0026660fad17`.
- Signed boot window: `[2026-08-10T16:36:53.501Z, 2026-08-10T16:46:59.731Z)`.
- Accepted messages: one handshake, one bootstrap status, and three heartbeats,
  all verified within the signed boot window with strictly increasing sequences.

All CHN-001.1 through CHN-001.11 wrappers resolve to their candidate content
addresses and to unique raw artifacts. Healthy exact-VM emergency stop reached Off
in 662 ms. Degraded-channel stop used a conservative, independently rechecked upper
bound of 2,548 ms from PowerShell event 40961/record 1079834 to exact-VM Hyper-V
event 18502/record 2340. The serializer failed only after the VM reached Off; the
receipt states that reconciliation explicitly.

The owner service destroyed only the exact generation under job
`cdb3277f-f5cb-4379-9a97-619473a95f2f`. The VM and generation root are absent. The
11.9 GB base remains read-only and re-hashed to the expected digest.

## Excluded evidence

Candidate `6c2df0fbfa243ca4b5dd0415ce9311fd0f5c085f73cc9fe292cfa08444b534cf`
was rejected because three selected messages predated the signed lifecycle boundary.
It is archived only for audit and is not cited by completion evidence or promotion.

## Verification

- `npm run test:chn001 -- --reporter=verbose` — 32/32 passed.
- `npm run test:completion -- --reporter=verbose` — 106/106 passed on the bounded
  rerun. A prior concurrent run passed all assertions but had one worker RPC timeout
  and was not counted.
- `npm run validate:evidence-artifacts` — 6/6 passed.
- `npm run scan:evidence-artifacts` — 13 artifacts, zero warnings or blockers.
- `npm run validate:repository`, `npm run validate:field-contract`,
  `npm run validate:plan`, `npm run typecheck`, and `npm run build` — passed.
- Post-promotion `npm run validate:completion` — zero integrity failures; CHN-001
  proven and the next phase is M2.
