# Exosuit Complete Master Plan Coverage Matrix

**Plan authority:** `docs/MASTER_SYSTEM_ROADMAP.md`  
**Revision reviewed:** 2026-07-22  
**Purpose:** prove that the owner's requested product and the repository's engineering obligations are represented in the authoritative plan.

## Owner requirements

| Requirement | Master-plan coverage | Implementation phase |
|---|---|---|
| Glove and Field must be clearly separate | Sections 3, 4, 10, 12 | permanent invariant; all phases |
| Both systems remain in one repository | Sections 1 and 3 | governance and every PR |
| Field is the complete Windows environment | Sections 4, 11, 12 | L1-L3 |
| Glove operates the entire desktop | Sections 14 and 15 | L4, L13-L15 |
| Browser is controlled like a normal app | Section 5 | L4, L13-L15 |
| No AI-browser dependency | Sections 5 and 6 | permanent invariant |
| Owner demonstrates the task first | Sections 16.1, 17, 18 | L5 |
| Record what the owner sees and does | Sections 17 and 18 | L4-L5 |
| Record mouse movement in detail | Sections 17.1 and 19.3 | L5, L11 |
| Record typing, spelling mistakes, and later corrections | Sections 17.1 and 19.4 | L5, L11 |
| Learn task order and completion habits | Sections 19.1, 19.7, 20 | L7-L10 |
| Learn attention, reading, and scrolling habits | Sections 19.2 and 21 | L7-L10 |
| Learn language and speech style | Section 19.5 | L11 |
| Learn timing and hesitation | Section 19.6 | L8, L11 |
| Learn corrections after divergence | Sections 16.3, 19.7, 20 | L9 |
| Predict without acting first | Sections 16.2 and 21 | L8 |
| Owner can take over and teach corrections | Section 16.3 | L9 |
| Perform validated portions under supervision | Sections 16.4 and 22 | L12 |
| Perform complete approved workflows later | Sections 16.5, 22, L13-L15 | L13-L15 |
| ChatGPT connects through MCP | Sections 4 and L14 | L14 |
| Model must not administer the Field | Sections 10 and L14 | permanent invariant |
| Mouse and keyboard behavior is local and fluid | Section 15 | L11-L13 |
| Fast reflex loop separate from LLM reasoning | Section 15 | L11-L13 |
| Continuous desktop understanding | Section 14 | L4 |
| Handle popups, focus changes, and interruptions | Sections 14, 25, 31 | L4, L13, L16 |
| Verify task completion | Sections 15, 19.8, 25 | all execution phases |
| Avoid blind retries and duplicate effects | Sections 25 and 31 | L13, L16 |
| Build manuals, audits, and tests for both products | Sections 27, 30, 32 | every phase |
| Apply Parts & Pieces patterns | Sections 27 and 35 | every relevant phase |
| Complete plan through production | Sections L0-L21 | entire program |

## Architecture coverage

| Architecture area | Sections | Primary phase |
|---|---|---|
| Field VM and Hyper-V | 11 | L1-L3 |
| Immutable base and disposable overlay | 11.2 | L1 |
| Personal state and task disk | 11.2 | L1, L16, L18 |
| Fixed display and input settings | 11.3 | L3 |
| Field filesystem | 11.4 | L3, L6 |
| Field identity and generation | 12 | L1-L3 |
| Authenticated channel | 13 | L2 |
| Heartbeat and readiness | 12-13 | L2-L3 |
| Scene graph | 14 | L4 |
| UI Automation and visual hierarchy | 14 | L4-L5 |
| Motor/reflex engine | 15 | L11-L13 |
| Teach recorder | 16.1, 17-18 | L5 |
| Shadow predictor | 16.2, 21 | L8 |
| Correction and Assisted modes | 16.3-16.4 | L9, L12 |
| Pilot authorization | 16.5 | L13-L15 |
| Behavior models | 19 | L10-L11 |
| Learning pipeline | 20 | L7-L12 |
| Skills | 22 | L12 |
| Credential broker | 23 | later security-bound implementation |
| Artifact transfer | 24 | L6 |
| Workflow recovery | 25 | L13, L16 |
| Audit and diagnostics | 26 | every phase |
| Cockpit | L17 | L17 |
| Packaging and updates | L18 | L18 |
| Security and privacy review | L19 | L19 |
| Production operations | L20 | L20 |

## Evidence and governance coverage

| Obligation | Plan coverage |
|---|---|
| Status vocabulary | Section 8 |
| Evidence ladder | Section 9 |
| Exact commit and environment evidence | Section 9 |
| Positive tests | Sections 30 and 32 |
| Negative and fault-injection tests | Sections 30-31 |
| Privacy and secret-leak tests | Sections 23, 26, 30-31 |
| Rollback for every phase | individual L0-L15 phases and Sections 32, 35 |
| Promotion gate for every phase | individual phase sections and Section 32 |
| Whole-system definition of done | Section 33 |
| Mandatory execution order | Section 34 |
| Change control | Section 35 |
| Explicit assumptions | Section 36 |
| Honest evidence-based revision | Section 37 |

## Current issue mapping

| GitHub issue | Plan phase |
|---:|---|
| #12 | L0 |
| #13 | L1 |
| #14 | L2 |
| #15 | L3 |
| #16 | L4-L5 |
| #17 | L6 |
| #18 | L8 |
| #19 | synthetic subset of L13 |

Intervening issues are created only after prerequisites pass and the implementation slice can be defined without pretending unproven details are settled.

## Coverage verdict

The authoritative plan now covers the complete stated system:

- separate Glove and Field products;
- complete Field construction;
- complete desktop control architecture;
- owner-consented demonstration capture;
- task, attention, motor, typing, language, timing, and correction learning;
- Shadow, Correction, Assisted, and Pilot progression;
- MCP acceptance;
- testing, audits, manuals, failure injection, rollback, packaging, security, privacy, and operations.

This matrix verifies written coverage. It does not prove implementation or live behavior. Execution evidence remains governed by the phase gates in the master plan.
