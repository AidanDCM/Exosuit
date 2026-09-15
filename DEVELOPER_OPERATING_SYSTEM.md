# Exosuit Developer Operating System

## North star

Build a precise, interruptible, model-independent local computer body that gives authorized AI pilots useful abilities without giving them ownership of permission, secrets, unrestricted execution, or hidden surveillance.

## Development sequence

1. contracts and fake provider
2. deterministic policy and audit ledger
3. MCP tools against fake provider
4. full-chain system pulse
5. authenticated loopback Windows agent
6. Windows UI Automation observe-only provider
7. local review and emergency-stop panel
8. scoped semantic actions in a test VM
9. screenshot fallback with privacy controls
10. optional smooth physical input in a test VM
11. ChatGPT Secure MCP Tunnel acceptance
12. selected production workflows, one app at a time

Do not skip directly to broad control.

## Build Fabric acceleration loop

Development uses a machine-readable slice contract in `development/current-slice.json`.
The fast feedback runner may select or parallelize safe source checks, but it does not
replace the complete exact-head commands, evidence levels, or roadmap promotion gates.

Use:

```text
npm run build:fast    # working-tree feedback; never promotion evidence
npm run build:exact   # complete local evidence runner
```

Elevated Field lifecycle work may be executed by the installed local Field owner
service only while an owner-installed, expiring policy is valid. The service accepts
only exact-generation `provision`, authenticated read-only `observe`, and `destroy` jobs, uses fixed hash-bound scripts,
has no MCP surface, and cannot grant recording, keys, export, policy, consent, modes,
or full control. Installation or policy replacement requires UAC. A submitted job is
a proposal to the local service; the service remains the execution authority.

## Slice rules

Each slice must be independently testable, reviewable, disableable, and documented. A slice should add one new capability or one new risk boundary, not both at once unless the test plan explicitly proves the combination.

## Question-everything checklist

For every new action, provider, endpoint, or tool, answer:

- What exact user intent does this serve?
- Is there a safer structured route?
- What data enters and leaves the boundary?
- Can any value contain a secret?
- Who classifies risk?
- Who grants approval?
- Can a model bypass that approval?
- What proves the action worked?
- What happens if focus changes halfway through?
- How does emergency stop interrupt it?
- What gets logged and redacted?
- What is the rollback or compensation path?
- What deny test proves the boundary?
- What local/manual behavior remains unvalidated?

## Evidence discipline

Use exact paths, names, commands, CI run IDs, logs, and artifacts. Separate:

- confirmed by static inspection,
- confirmed by unit/integration tests,
- confirmed by GitHub-hosted Windows compilation,
- confirmed by a local Windows session,
- confirmed through ChatGPT MCP,
- still an inference.

Never upgrade one evidence class into another.

## Safety asymmetry

Removing or demoting an action is usually safe. Expanding autonomy is not. Therefore:

- unknown becomes blocked,
- uncertain becomes review-required,
- repeated failure becomes stop,
- stale approval becomes invalid,
- changed active window invalidates the action,
- missing verification prevents continuation,
- a disconnected control panel does not weaken policy.

## Reuse discipline

Before custom code, inspect Parts & Pieces and donor repos. For every reused part, record whether it is:

- copied unchanged,
- ported to another language,
- adapted with stronger constraints,
- used only as a blueprint,
- rejected and why.

Do not copy donor weaknesses simply to preserve similarity.

## Definition of done for a GitHub slice

- code and docs agree,
- all new schemas have positive and negative tests,
- policy has allow/review/block tests,
- full-chain fake-provider pulse passes,
- TypeScript builds with strict mode,
- Windows agent compiles and its pure logic tests pass,
- CI evidence is linked,
- the Level 4 audit is updated,
- remaining local checks are explicit,
- rollback instructions exist.

## Definition of done for live desktop capability

In addition to GitHub completion:

- a dedicated Windows test environment is used,
- the control panel is visible,
- emergency stop is physically tested,
- wrong-window changes are detected,
- DPI and multi-monitor behavior are tested,
- a semantic UI Automation action succeeds and verifies,
- a failed action stops instead of drifting,
- audit hashes verify after the session,
- no screenshot or secret leakage is observed,
- ChatGPT invokes the expected MCP tools through the private connection,
- the owner reviews and accepts the evidence.
