---
name: apex-statechart
description: "Model stateful workflows, concurrency protocols, or state machines as explicit statecharts and verify reachability and safety invariants."
disable-model-invocation: true
---

# Apex Statechart: Formal State-Machine & Invariant Verification

Eliminate impossible states, race conditions, and unhandled transitions in stateful code before writing implementation logic.

## Process

1. **Extract the State Space:**
   - **States ($S$):** Enumerate all mutually exclusive states (`IDLE`, `LOADING`, `COMMITTED`, `FAILED`, etc.) and initial state $S_0$.
   - **Events ($E$) & Guards ($G$):** Enumerate every external trigger and precondition.
   - **Transitions ($S \times E \to S'$):** Construct the complete transition matrix and render a `stateDiagram-v2` Mermaid diagram.
2. **Verify 4 Formal Safety Properties:**
   - [ ] **Determinism:** No state-event pair $(s, e)$ has two transitions with overlapping guards.
   - [ ] **Deadlock / Sink Freedom:** Every non-terminal state has at least one outbound recovery or completion transition.
   - [ ] **Invariant Preservation:** Safety invariants (e.g., *"balance >= 0"*, *"at most one active writer lock"*) hold in every reachable state.
   - [ ] **Idempotency on Duplicate Events:** Re-delivering an event in target state $S'$ is a safe no-op.
3. **Encode as Discriminated Unions:** Map the verified statechart directly into strict discriminated union types so illegal states are unrepresentable at compile time.
