---
name: apex-waves
description: "Execute a spec or ticket graph across mathematically disjoint worktree waves while reusing warm subagent contexts to preserve KV-Cache."
disable-model-invocation: true
---

# Apex Waves: Disjoint-Seam Wave Execution & Warm KV-Cache Orchestration

Execute multi-task specifications without triggering SWE-bench's `-24%` multi-agent concurrency accuracy drop or Lauren Tan's `412k` cold-cache token explosion.

## Three Architectural Guarantees

1. **Mathematically Disjoint Parallel Waves ($\text{Seams}_A \cap \text{Seams}_B = \emptyset$):**
   - Before spawning parallel worktree subagents, list every task's `dependsOn` and `touchedSeams` (file paths / module globs).
   - Never run two tasks in the same wave if their `touchedSeams` overlap (`src/seam-analyzer.ts` `scheduleDisjointWaves`). Overlapping tasks are automatically serialized into subsequent waves.
   - A shared constant or method belongs in `touchedSeams`. The tasks then serialize on that canonical file instead of each declaring a local copy.
2. **Warm KV-Cache Subagent Reuse (Never Spawn Cold Fixers):**
   - When `apex-verify` or tests flag an issue on a task, send the fix instruction back to the **existing warm implementer context** that already holds the codebase prefix in its KV-Cache (saving ~90% input read cost), rather than spawning a cold subagent from scratch.
3. **LEAF-AGENT GUARD:** Every implementer subagent prompt begins with:
   > *"LEAF-AGENT GUARD: Implement only your assigned task seam using `apex-tdd` principles. Do not spawn nested subagents or touch files outside your declared `touchedSeams`."*

## Wave Execution Loop
1. Partition tasks into disjoint waves (`Wave 1`, `Wave 2`, ...).
2. For each wave:
   - If the wave has 1 task, execute sequentially in the main session via `apex-tdd`.
   - If the wave has `N >= 2` disjoint tasks, run each in an isolated git worktree branched from the integration branch, verify green tests, and fast-forward merge back.
3. Close out the completed integration branch by calling the Skill tool with `apex-verify` and `apex-guard`.
