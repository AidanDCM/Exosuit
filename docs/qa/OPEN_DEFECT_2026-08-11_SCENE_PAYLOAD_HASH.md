# OPEN DEFECT — a guest scene cannot be verified by the host

**Found:** 2026-08-11, by the scene wire-contract fixture.
**Status:** open. Not fixed. **Blocks SCN-001 live injection.**
**Severity:** every scene the guest publishes would be rejected by the host.

## Two defects, one found while fixing the other

### 1. Envelope timestamps were not canonical — FIXED

`FieldKvpRuntime.SerializeEnvelope` wrote `"sentAt":"2026-08-11T12:00:01+00:00"`. The TypeScript
envelope schema requires `yyyy-MM-ddTHH:mm:ss.fffZ` and rejects the offset form outright, so every
guest envelope failed to parse on the host before any signature was even considered.

It was latent because the guest→host path exercised by CHN-001 verifies with the **C#** reader,
which parses both forms. The TypeScript receiver is the M2 scene path and had never run against a
real guest envelope.

Fixed by `CanonicalUtcDateTimeOffsetConverter`, registered in the wire JSON options. **This changes
no signature and no hash**: signing payloads are built from a separately formatted canonical
string, and `payloadHash` covers the payload only. It changes how a timestamp is written into
JSON, nothing else.

### 2. Scene payload hashes disagree across languages — OPEN

With the envelope parsing, the receiver now rejects with:

```
Field channel payload hash is invalid.
```

- C# declares  `29d88e85cef893d4f3ef1a5228005f7e00a698dbc56a4f0de0f8f382ad541051`
- TypeScript computes `db3ab48e72e07a8122e0e5af6ce88f3e316bfbbaaa12c4e5a4233f1d6ceb9665`

**Each language is self-consistent.** `FieldSceneWireContractTests` passes 5/5: C# verifies its own
serialized envelope, including the hash. TypeScript verifies envelopes it creates. They disagree
only with each other.

**Heartbeat payloads agree**, which is why nothing caught this: `field-channel-v1.json` pins a
heartbeat across both languages and passes. Heartbeat payloads are flat dictionaries of primitives
and pre-formatted strings. Scene payloads carry a nested `DesktopObservation` with enums, a
timestamp, and arrays — and that is where the two canonicalisations part company.

## What has been ruled out

- **Character escaping.** C# escapes `+` as `+`; TypeScript does not. Emulating the C#
  escaping on the TypeScript side produced a byte-identical string and the identical hash, so this
  is not the cause.
- **Enum representation.** Both forms emit `"mode":"observe"`, `"source":"accessibility"`, and
  `"supportedActions":["invoke_element"]`. They agree.
- **Field values generally.** Every field inspected matches between the hashed form and the wire
  form.
- **Key ordering.** Both canonicalisers sort keys; the hashed form is sorted and the verifier
  re-canonicalises before comparing.

The remaining candidates are how each side treats a value the other omits or renders differently —
most likely a null, an absent optional, or an empty collection inside the nested observation. That
has not been isolated, and this document does not guess at it.

## Why it is not fixed here

The fix changes payload canonicalisation, which changes `payloadHash`, which is covered by the
signature. That touches the channel used by **CHN-001 evidence that has already passed**. Whatever
the fix is, it warrants a deliberate decision about re-verification of existing artifacts, not a
drive-by change made while chasing a test failure — and certainly not one landed immediately
before a live session.

## Consequences for the SCN-001 session

The runbook's "where this is most likely to break first" list did not include this, and should
have. As it stands:

- **SCN-001.L2 cannot pass.** A scene will reach the host, parse, and then fail hash verification.
- The failure will present as `scene rejected: Field channel payload hash is invalid` through
  `readSceneFromKvp`, and the host monitor will invalidate with that reason. That is the correct
  fail-closed behaviour, and it is not the ceremony passing.
- Running the session before this is fixed would prove the transport and the fail-closed path, and
  nothing about scene acceptance.

## Reproduction

```
npx vitest run tests/fieldSceneWireContract.test.ts
```

Three cases are skipped and marked with this document. They are skipped rather than deleted or
weakened, because the assertions are correct and the product is wrong. Un-skip them to see the
failure.

`tests/fixtures/field-scene-v1.json` was generated from the real C# producer boundary and signing
path, not hand-authored.
