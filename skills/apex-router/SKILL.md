---
name: apex-router
description: "Diagnose task shape and epistemic uncertainty to select the optimal Apex skill and Smart-Zone phase boundary transition."
disable-model-invocation: true
---

# Apex Router: 2x2 State-Space Diagnostic & Smart-Zone Advisor

Protect the **Smart Zone (< 150k tokens)** and route the user's current problem across two orthogonal axes: **Shape (Point vs. Frontier)** and **Uncertainty (Known vs. Fog of War)**.

## 1. The 2x2 Diagnostic Matrix

| Uncertainty \ Shape | **Point (Single Seam / Localized Change)** | **Frontier (Multi-Module / Cross-Cutting Graph)** |
| :--- | :--- | :--- |
| **Known (Clear Spec & Seams)** | Call the Skill tool with `apex-tdd` (or `apex-diagnose` for bugs) -> `apex-verify` | Run `/apex-waves` (Disjoint-Seam Wave Graph) -> `apex-verify` -> `/apex-ship` |
| **Fog of War (High Ambiguity / Unknowns)** | Call the Skill tool with `apex-grill` -> `/apex-spec` -> `apex-tdd` | Run `/apex-wayfinder` (1 Decision Ticket per 100k session) or `/apex-arena` |

## 2. The 5 Phase-Boundary Transitions (Work Top-to-Bottom; First YES Wins)

Evaluate only at a **Phase Boundary** (never compact mid-phase):

1. **Continue in Current Session:** Does the next phase need the verbatim reasoning of this phase as a **Primary Source**, AND does the session remain well inside the **< 150k-token Smart Zone**? -> **Stay and continue.**
2. **`/clear` (Cheapest Reset):** Is the current exploration/debugging context disposable now that the fix or spec is committed to disk? -> **Run `/clear`.**
3. **`/apex-handoff` (Cross-Harness / Portable File):** Are you switching harnesses (Claude <-> Codex <-> Cursor <-> Gemini), switching repos, or delegating to a teammate? -> **Run `/apex-handoff`.**
4. **Depth-1 Leaf Subagent (Tight AFK Scope):** Is the next step a self-contained verification or research probe that needs zero human steering? -> **Spawn a Depth-1 Leaf Subagent.**
5. **`/compact <focus instruction>` (Lossy Last Resort):** Same repo and harness, relevant history, but approaching the 150k Smart-Zone ceiling -> **Compact with an explicit retention instruction.**

## Output Format
State: (1) Current Quadrant, (2) Recommended Next Skill/Command, and (3) Exact Phase-Boundary Action.
