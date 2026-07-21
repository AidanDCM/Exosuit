# Exosuit Field Definition of Done

The word “done” must always name a level.

## Source done

- contracts and pure/fake components exist;
- positive/negative tests are written;
- docs, audit, rollback, and evidence boundary exist;
- CI and local validation commands include the change.

Current branch target: substantially complete, executable validation pending.

## Repository validated

- all G0-G1 release gates pass on exact commit;
- evidence logs/artifacts attached;
- no unresolved compiler/test/parser failures.

## Hyper-V validated

- G2-G3 pass in one disposable synthetic generation;
- isolation, identity, heartbeat, bootstrap, rollback, and destruction evidence captured.

## Teach validated

- G4 passes with synthetic/private-safe demonstrations;
- recording is visible, consented, stoppable, encrypted, deletable, and non-executing.

## Shadow validated

- G5 passes;
- actual predictor operates without any input authority.

## Pilot fixture validated

- G6-G7 pass for one named synthetic workflow and exact environment build;
- this does not imply general desktop capability.

## Production ready

- G8 passes;
- owner acceptance and operational/security review are explicit.

## Forbidden shorthand

Do not say:

- “Field works” when only source tests exist;
- “Hyper-V validated” after plan/schema tests;
- “Teach works” after episode-store tests;
- “learns the owner” after Shadow schemas;
- “autonomous” after a fake pulse;
- “production-ready” after one synthetic workflow.
