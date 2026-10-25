---
name: apex-arena
description: "Run a targeted 2-worktree adversarial implementation tournament for high-risk architectural trade-offs and graft the winning design."
disable-model-invocation: true
---

# Apex Arena: Targeted Adversarial Prototyping & Seam Grafting

Reserve multi-agent competition strictly for **high-risk architectural or algorithmic trade-offs** where two distinct approaches have non-obvious performance or simplicity characteristics.

## Rules
- **LEAF-AGENT GUARD:** Both contestant subagents are strict **Depth-1 Leaf Agents** (*"LEAF-AGENT GUARD: Do not invoke skills or spawn child subagents"*).
- **Identical Public Seam Contract:** Both contestants must implement the exact same public interface seam and pass the same deterministic benchmark/test harness.

## Process
1. **Define the 2 Competing Designs & Deterministic Scorecard:**
   - Candidate A (e.g., in-memory DAG scheduler) vs. Candidate B (e.g., topological matrix pass).
   - Scorecard: (1) Correctness on seam test suite, (2) Measured latency/memory, (3) Module depth (interface simplicity vs. implementation complexity).
2. **Dispatch 2 Isolated Worktree Subagents:**
   - Run Candidate A and Candidate B in separate git worktrees (`worktree-arena-a`, `worktree-arena-b`).
3. **Evaluate & Graft:**
   - Run the deterministic benchmark on both worktrees.
   - Select the winner (or graft the best helper from the runner-up into the winner), merge to the working branch, and remove both temporary worktrees.
