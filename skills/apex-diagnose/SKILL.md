---
name: apex-diagnose
description: "Debug broken code, diagnose hard bugs, fix failing tests, investigate crashes, stack traces, errors, or root-cause performance regressions."
---

# Apex Diagnose: Red-Loop First Bug & Performance Diagnosis

Never guess a fix from reading code alone. Build a **tight, deterministic pass/fail feedback loop that goes red on the exact symptom** before forming hypotheses.

## Redact First
Replace every secret, token, cookie, or DSN in command outputs and traces with `<REDACTED>`. Bind credentials via environment variables, never inline arguments.

## Process

### Phase 1: Construct a Tight Red-Capable Loop (Mandatory Gate)
Build and run **one unattended command** (test invocation, `curl`, CLI fixture, Playwright script, trace replay, or `git bisect` harness) that:
- [ ] **Goes Red on the exact symptom** reported by the user (not an unrelated error).
- [ ] **Runs in seconds** and is deterministic (for flaky bugs, loop 50x-100x under stress to pin a measurable reproduction rate).

**STOP GATE:** Do not advance to Phase 2 until you have executed this command at least once and observed it go red.

### Phase 2: Shrink to the Load-Bearing Repro
Strip inputs, config, and steps one at a time, re-running the loop after each cut, until removing any remaining element turns the loop green.

### Phase 3: Rank 3-5 Falsifiable Hypotheses
State 3-5 competing hypotheses with explicit falsifiable predictions:
> *"If `<X>` is the root cause, then `<probe Y>` will produce `<observation Z>`."*

### Phase 4: Targeted Probe & Fix at the Seam
1. Tag temporary logs with `[DEBUG-apex]` so cleanup is a single `grep`.
2. For performance bugs, capture a baseline metric (`p95`, query plan, flamegraph) before changing code.
3. Convert the minimal repro into a permanent regression test at the public seam, apply the root-cause fix, watch it go green, and strip all `[DEBUG-apex]` probes.
