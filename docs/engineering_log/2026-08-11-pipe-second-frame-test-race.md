# A flaky test that was wrong about its own contract

- **Goal:** fix `FieldSceneRelayPipeServerTests.RejectsASecondFrameOnTheSameConnection`, which
  failed intermittently and blocked a push.
- **Files changed:** that test, this log.

## How it surfaced

The pre-push CI-parity gate failed against a clean checkout:

```
FAIL  windows-agent: tests
      FieldSceneRelayPipeServerTests.RejectsASecondFrameOnTheSameConnection [FAIL]
```

The class in isolation passed eight times out of eight. The full agent suite reproduced it three
times out of six — the flake needs the load of the whole suite, which is why it had passed
repeatedly during the slice that introduced it and only appeared once a clean-checkout gate ran.

## What was actually wrong

```
System.IO.IOException : Pipe is broken.
  at PipeStream.WriteAsyncCore(...)
  at PipeStream.WriteAsync(...)
```

The exception is in the **client's write**, inside the test — not in the intake.

The intake rejects as soon as it reads a single byte past the declared payload, then unwinds and
disposes the pipe. The test wrote the second frame as four sequential awaited writes and assumed
all of them would complete before the server reacted. Under load the server won, the pipe closed
mid-write, and the client's `WriteAsync` threw before the assertion on the accept task was ever
reached.

So the product was right and the test was wrong about the contract it was testing. Worth stating
plainly: **prompt rejection is the desired behaviour.** An intake that let the entire second frame
land before reacting would be the worse outcome, and the original test would have been perfectly
happy with it.

## The fix

The client's second-frame writes are wrapped so a broken pipe is tolerated, with the reasoning in
the test itself. The assertion that matters is unchanged: `AcceptSingleFrameAsync` must throw.

This is not a timing workaround. There is no sleep, no retry, and no widened timeout. The test now
permits both legitimate orderings — the server rejecting mid-write, or after the client finishes —
and requires the same outcome from each.

- **Verification:** the class in isolation passes; **twelve consecutive full agent-suite runs are
  clean**, against three failures in six before the change.
- **Scope note:** this test was introduced earlier on this branch and has already been pushed, so
  the flake was live in the branch history before it was caught. It never indicated a product
  defect.
- **Rollback:** restore the unguarded writes and accept an intermittently failing test.
