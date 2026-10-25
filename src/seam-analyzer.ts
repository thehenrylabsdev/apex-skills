import { matchesScopePattern } from "./memory-ledger.js";
import type {
  KvCacheSimulationComparison,
  KvCacheSimulationInput,
  SeamConflict,
  TaskNode,
  WaveScheduleResult,
} from "./types.js";

/**
 * Checks whether two file/seam scope patterns can overlap.
 */
export function seamsOverlap(seamA: string, seamB: string): boolean {
  const cleanA = seamA.trim().replace(/\\/g, "/").replace(/^\.\//, "");
  const cleanB = seamB.trim().replace(/\\/g, "/").replace(/^\.\//, "");

  if (cleanA === cleanB) {
    return true;
  }

  if (
    matchesScopePattern(cleanA, cleanB) ||
    matchesScopePattern(cleanB, cleanA)
  ) {
    return true;
  }

  const prefixA = cleanA.split("*")[0]?.replace(/\/$/, "") ?? "";
  const prefixB = cleanB.split("*")[0]?.replace(/\/$/, "") ?? "";

  if (prefixA.length === 0 || prefixB.length === 0) {
    return true;
  }

  return (
    prefixA === prefixB ||
    prefixA.startsWith(`${prefixB}/`) ||
    prefixB.startsWith(`${prefixA}/`)
  );
}

/**
 * Detects whether two tasks touch any overlapping file or architectural seam.
 */
export function findTaskSeamConflict(
  taskA: TaskNode,
  taskB: TaskNode,
): SeamConflict | null {
  for (const seamA of taskA.touchedSeams) {
    for (const seamB of taskB.touchedSeams) {
      if (seamsOverlap(seamA, seamB)) {
        return {
          taskA: taskA.id,
          taskB: taskB.id,
          overlappingSeams: [seamA, seamB],
        };
      }
    }
  }
  return null;
}

/**
 * Schedules a DAG of tasks into mathematically disjoint parallel execution waves.
 * Tasks with explicit dependencies OR overlapping touchedSeams are never placed in the same wave,
 * eliminating multi-agent delivery race conditions (SWE-bench concurrency failure mode).
 */
export function scheduleDisjointWaves(
  tasks: readonly TaskNode[],
): WaveScheduleResult {
  const taskMap = new Map<string, TaskNode>();
  for (const task of tasks) {
    if (taskMap.has(task.id)) {
      throw new Error(`Duplicate task ID detected: ${task.id}`);
    }
    taskMap.set(task.id, task);
  }

  for (const task of tasks) {
    for (const depId of task.dependsOn) {
      if (!taskMap.has(depId)) {
        throw new Error(
          `Task "${task.id}" depends on unknown task "${depId}"`,
        );
      }
    }
  }

  const completed = new Set<string>();
  const waves: string[][] = [];
  const serializedConflicts: SeamConflict[] = [];

  while (completed.size < tasks.length) {
    const readyCandidates = tasks.filter(
      (task) =>
        !completed.has(task.id) &&
        task.dependsOn.every((depId) => completed.has(depId)),
    );

    if (readyCandidates.length === 0) {
      throw new Error("Cycle detected in task dependency graph");
    }

    const currentWave: TaskNode[] = [];

    for (const candidate of readyCandidates) {
      let conflictFound: SeamConflict | null = null;
      for (const alreadyScheduled of currentWave) {
        const conflict = findTaskSeamConflict(alreadyScheduled, candidate);
        if (conflict !== null) {
          conflictFound = conflict;
          break;
        }
      }

      if (conflictFound !== null) {
        serializedConflicts.push(conflictFound);
      } else {
        currentWave.push(candidate);
      }
    }

    const waveIds = currentWave.map((t) => t.id);
    waves.push(waveIds);
    for (const id of waveIds) {
      completed.add(id);
    }
  }

  const maxParallelism = waves.reduce(
    (max, wave) => Math.max(max, wave.length),
    0,
  );

  return {
    waves,
    serializedConflicts,
    maxParallelism,
  };
}

/**
 * Computes the KV-Cache and uncached token consumption comparison between:
 * 1. Cold-Subagent-Per-Round (e.g., LaurenTan's pstack `feature.md` which spawns a fresh fixer every round)
 * 2. Warm-Subagent-Reuse + Disjoint Waves (`apex-waves` architecture)
 */
export function simulateKvCacheEconomics(
  input: KvCacheSimulationInput,
): KvCacheSimulationComparison {
  const perSubagentPrefix =
    input.systemAndSkillTokens + input.codebaseContextTokens;

  // Model A: Cold fresh subagents per step (4 architect/interrogate + subtasks + rounds * (reviewers + 1 comment-sicko + 1 fresh fixer))
  const coldSubagentSpawns =
    4 +
    input.subtasksCount +
    input.reviewFixRounds * (input.reviewersPerRound + 2);
  const coldUncachedPrefixTokens = coldSubagentSpawns * perSubagentPrefix;
  const coldFreshSubagentTotalTokens = coldUncachedPrefixTokens;

  // Model B: Apex Warm Reuse
  // 1 warm implementer context + 2 leaf reviewers (Standards + Spec) that reuse warm prefix across rounds
  const warmUniqueSubagentContexts = 3;
  const warmUncachedPrefixTokens =
    warmUniqueSubagentContexts * perSubagentPrefix;
  const warmFollowUpTurns =
    Math.max(0, input.subtasksCount - 1) + input.reviewFixRounds * 3;
  const warmCachedReadTokens = warmFollowUpTurns * perSubagentPrefix;
  // Cached reads cost ~10% of uncached input tokens on modern frontier APIs
  const warmEffectiveCostTokens =
    warmUncachedPrefixTokens + Math.round(warmCachedReadTokens * 0.1);

  const uncachedTokenReductionRatio =
    coldUncachedPrefixTokens > 0
      ? Number(
          (
            (coldUncachedPrefixTokens - warmEffectiveCostTokens) /
            coldUncachedPrefixTokens
          ).toFixed(4),
        )
      : 0;

  return {
    coldFreshSubagentTotalTokens,
    coldUncachedPrefixTokens,
    warmReuseTotalTokens: warmEffectiveCostTokens,
    warmUncachedPrefixTokens,
    warmCachedReadTokens,
    uncachedTokenReductionRatio,
  };
}
