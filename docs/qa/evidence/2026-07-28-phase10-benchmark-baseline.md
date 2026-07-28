# Phase 10 Benchmark Baseline

**Generated:** 2026-07-28T15:40:45.829Z
**Iterations:** 100 (plus 10 warmup)
**Node:** v22.14.0 · **Platform:** win32 x64

> These are **measurements, not targets.** The roadmap requires Phase 10 service
> targets to be derived from benchmarks rather than invented in advance; choosing
> them is an owner decision that also needs real-desktop numbers. Every figure here
> comes from the in-process fake provider on one developer workstation, so it
> characterizes Exosuit's own overhead, not real desktop responsiveness.

## Latency

| Measurement | n | min | p50 | p95 | p99 | max | unit |
|---|--:|--:|--:|--:|--:|--:|---|
| observation latency | 100 | 0.167 | 0.220 | 1.038 | 1.350 | 2.883 | ms |
| semantic-action proposal latency | 100 | 0.108 | 0.332 | 1.276 | 3.973 | 4.550 | ms |
| execute + verify latency | 100 | 0.064 | 0.200 | 0.616 | 0.860 | 0.935 | ms |
| emergency-stop latency | 100 | 0.062 | 0.133 | 0.431 | 0.722 | 0.734 | ms |
| audit append latency | 100 | 0.026 | 0.036 | 0.074 | 0.092 | 0.126 | ms |
| workflow scheduler overhead (10 steps, per step) | 50 | 10.638 | 13.381 | 18.470 | 26.633 | 26.633 | ms/step |

## Workflow scheduler scaling

Median of 5 runs per size, no-op executor, so this is scheduler overhead alone.

| Steps | Total | Per step |
|--:|--:|--:|
| 1 | 0.4 ms | 0.38 ms |
| 5 | 3.0 ms | 0.61 ms |
| 10 | 9.6 ms | 0.96 ms |
| 25 | 53.3 ms | 2.13 ms |
| 50 | 189.1 ms | 3.78 ms |
| 100 | 847.7 ms | 8.48 ms |

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
