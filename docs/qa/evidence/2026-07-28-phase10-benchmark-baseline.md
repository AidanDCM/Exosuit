# Phase 10 Benchmark Baseline

**Generated:** 2026-07-28T15:14:33.227Z
**Iterations:** 200 (plus 20 warmup)
**Node:** v22.14.0 · **Platform:** win32 x64

> These are **measurements, not targets.** The roadmap requires Phase 10 service
> targets to be derived from benchmarks rather than invented in advance; choosing
> them is an owner decision that also needs real-desktop numbers. Every figure here
> comes from the in-process fake provider on one developer workstation, so it
> characterizes Exosuit's own overhead, not real desktop responsiveness.

## Latency

| Measurement | n | min | p50 | p95 | p99 | max | unit |
|---|--:|--:|--:|--:|--:|--:|---|
| observation latency | 200 | 0.081 | 0.101 | 0.312 | 0.883 | 1.341 | ms |
| semantic-action proposal latency | 200 | 0.050 | 0.057 | 0.383 | 0.931 | 1.485 | ms |
| execute + verify latency | 200 | 0.029 | 0.064 | 0.121 | 0.228 | 0.479 | ms |
| emergency-stop latency | 100 | 0.033 | 0.036 | 0.076 | 0.103 | 0.165 | ms |
| audit append latency | 200 | 0.014 | 0.014 | 0.016 | 0.034 | 0.962 | ms |
| workflow scheduler overhead (10 steps, per step) | 50 | 7.620 | 9.529 | 12.068 | 13.968 | 13.968 | ms/step |

## Workflow scheduler scaling

Median of 5 runs per size, no-op executor, so this is scheduler overhead alone.

| Steps | Total | Per step |
|--:|--:|--:|
| 1 | 0.2 ms | 0.24 ms |
| 5 | 3.0 ms | 0.60 ms |
| 10 | 9.7 ms | 0.97 ms |
| 25 | 45.9 ms | 1.84 ms |
| 50 | 172.3 ms | 3.45 ms |
| 100 | 1023.6 ms | 10.24 ms |

**Per-step cost is not constant — it grows with workflow length.** Total time rises
faster than step count, which is the signature of per-step work that is linear in the
number of steps (an O(n^2) scheduler). Small workflows are unaffected; long ones
degrade. This is a measurement, not a diagnosis: the responsible code has not been
profiled and no fix is claimed here.

## Resource use

| Measurement | Value | Caveat |
|---|---|---|
| memory per tracked window | ~0.36 KiB/window at 1000 windows | measured with forced GC |
| audit growth | ~324 bytes/event (serialized, 1000 events) | in-memory serialization; on-disk JSONL adds a newline per record |

## Target classes not covered

These are listed in the Phase 10 objectives but cannot be measured against a fake
provider. A fabricated number here would be worse than none.

- **focus-switch latency** — requires a real interactive Windows desktop
- **motor start latency** — requires armed physical input in a disposable VM
- **CPU while idle and observing** — requires a real provider and a quiet machine profile
- **maximum agents** — requires multiple real agents or VMs
