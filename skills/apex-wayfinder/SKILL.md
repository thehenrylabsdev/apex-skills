---
name: apex-wayfinder
description: "Navigate large, multi-session Fog-of-War initiatives by maintaining a wayfinder map and resolving one decision ticket per session."
disable-model-invocation: true
---

# Apex Wayfinder: Multi-Session Epistemic Map Orchestrator

Conquer high-uncertainty **Fog of War** projects across multiple sessions without blowing the 150k-token Smart Zone.

## Core Loop

1. **Locate or Initialize the Map (`.apex/wayfinder-map.md` or Issue Tracker `wayfinder:map`):**
   - Stores: (a) North-Star Goal, (b) Resolved Architectural Decisions (linked to `DECISIONS.md`), (c) Active Decision Tickets, and (d) Discovered Seams.
2. **Classify Unblocked Decision Tickets into 4 Epistemic Types:**
   - `research`: Answer an empirical question about existing code, external APIs, or constraints.
   - `prototype`: Build a throwaway spike to measure feasibility or latency.
   - `grilling`: Resolve product/domain trade-offs with the user (Call the Skill tool with `apex-grill` and `apex-memory`).
   - `task`: Implement a well-specified vertical slice (Call the Skill tool with `apex-tdd`).
3. **One-Ticket-Per-Session Discipline:**
   - Execute **at most 1 Decision Ticket** in the current session.
   - Fold the findings back into `.apex/wayfinder-map.md`, `GLOSSARY.md`, and `DECISIONS.md` (pinned to the latest commit SHA).
   - Recommend `/clear` before starting the next Decision Ticket so every session operates at peak reasoning sharpness.
