# Scene observation deadline and bounded first slice

## Change report

- **Goal:** prevent the one-shot interactive scene producer from waiting indefinitely in Windows UI Automation before it connects to the privileged relay.
- **Master-plan phase and gate:** L4 live scene production; this supports the first live structural-scene evidence but does not satisfy the L4 promotion gate.
- **Subsystem ownership:** Field-owned observe-only producer and shared authenticated observation boundary; no Glove execution authority changed.
- **Files changed:** `FieldSceneProducerHost.cs`, its focused tests, Field implementation status, failure-injection matrix, this log, and the matching atomic audit.
- **Identity/generation and policy impact:** none. Exact Field/generation/boot/session/SID/path/digest binding is unchanged. The pilot cannot create or expand policy.
- **Parts & Pieces and donor patterns:** retained the existing one-process/one-frame producer and provider interface; no donor code was imported.
- **Questions and assumptions:** Generation 19 metadata-only telemetry ended at `pipe_waiting_for_client`, with the service and heartbeat emitter healthy and no producer present after the bounded observation window. The source provider called `FindAll(Descendants)` before applying `Take(MaxElements)`, so the advertised count did not bound the COM traversal.
- **Implementation:** the initial production request collects top-level windows without descendant elements or screenshots and the producer applies a fixed 30-second observation deadline. UIA element snapshots remain a separate open L4 slice requiring a genuinely bounded walker.
- **Tests actually run:** Release build passed with warnings as errors; focused producer/session tests passed 15/15; the full Windows-agent suite passed 292/292; Field tests passed 263/263; the Field system pulse passed 1/1; repository, master-plan, and Field-contract validators passed; TypeScript typecheck passed.
- **Evidence class:** source and automated component evidence plus Generation 19 live diagnostic evidence. No live scene has yet been accepted or promoted.
- **Security/privacy impact:** reduces denial-of-service exposure and continues to emit no screenshots or retained UI text. It does not add recording, input, execution, export, credential, host-surveillance, or policy authority.
- **Failure behavior:** timeout exits the unprivileged producer; the supervisor records failure and does not retry an uncertain frame in-process.
- **Rollback:** revert this slice or remove/disable `C:\Exosuit\Config\scene-session.json`; scene production remains opt-in.
- **Next slice:** build and seal a fresh immutable base, provision a fresh generation, prove one authenticated top-level structural scene, then design bounded element traversal and large-tree failure evidence.
