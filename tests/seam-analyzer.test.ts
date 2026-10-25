import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  scheduleDisjointWaves,
  seamsOverlap,
  simulateKvCacheEconomics,
} from "../src/seam-analyzer.js";
import type { TaskNode } from "../src/types.js";

void describe("DisjointSeamAnalyzer", () => {
  void it("detects overlapping file and glob seams accurately", () => {
    assert.equal(seamsOverlap("src/auth/login.ts", "src/auth/**"), true);
    assert.equal(seamsOverlap("src/auth/**", "src/billing/**"), false);
    assert.equal(seamsOverlap("GLOSSARY.md", "GLOSSARY.md"), true);
  });

  void it("partitions independent tasks with disjoint seams into the same parallel wave", () => {
    const tasks: readonly TaskNode[] = [
      {
        id: "t1",
        title: "Build auth seam",
        dependsOn: [],
        touchedSeams: ["src/auth/**"],
      },
      {
        id: "t2",
        title: "Build billing seam",
        dependsOn: [],
        touchedSeams: ["src/billing/**"],
      },
      {
        id: "t3",
        title: "Integration checkout",
        dependsOn: ["t1", "t2"],
        touchedSeams: ["src/checkout/**"],
      },
    ];

    const schedule = scheduleDisjointWaves(tasks);
    assert.deepEqual(schedule.waves, [["t1", "t2"], ["t3"]]);
    assert.equal(schedule.maxParallelism, 2);
    assert.equal(schedule.serializedConflicts.length, 0);
  });

  void it("automatically serializes concurrent tasks that touch overlapping seams into separate waves", () => {
    const tasks: readonly TaskNode[] = [
      {
        id: "t1",
        title: "Update auth token parser",
        dependsOn: [],
        touchedSeams: ["src/auth/token.ts", "GLOSSARY.md"],
      },
      {
        id: "t2",
        title: "Update billing terms in glossary",
        dependsOn: [],
        touchedSeams: ["src/billing/invoice.ts", "GLOSSARY.md"],
      },
    ];

    const schedule = scheduleDisjointWaves(tasks);
    assert.deepEqual(schedule.waves, [["t1"], ["t2"]]);
    assert.equal(schedule.maxParallelism, 1);
    assert.equal(schedule.serializedConflicts.length, 1);
    const conflict = schedule.serializedConflicts[0];
    assert.ok(conflict !== undefined);
    assert.equal(conflict.taskA, "t1");
    assert.equal(conflict.taskB, "t2");
  });

  void it("throws on dependency cycles or unknown dependencies", () => {
    const cyclicTasks: readonly TaskNode[] = [
      {
        id: "a",
        title: "A",
        dependsOn: ["b"],
        touchedSeams: ["src/a.ts"],
      },
      {
        id: "b",
        title: "B",
        dependsOn: ["a"],
        touchedSeams: ["src/b.ts"],
      },
    ];
    assert.throws(() => scheduleDisjointWaves(cyclicTasks), /Cycle detected/);
  });

  void it("proves >65% uncached token reduction when reusing warm KV-cache contexts vs. cold fresh subagents", () => {
    const sim = simulateKvCacheEconomics({
      systemAndSkillTokens: 2000,
      codebaseContextTokens: 15000,
      subtasksCount: 3,
      reviewFixRounds: 3,
      reviewersPerRound: 2,
    });

    assert.equal(sim.coldFreshSubagentTotalTokens, 19 * 17000);
    assert.ok(sim.uncachedTokenReductionRatio > 0.65);
    assert.ok(sim.warmReuseTotalTokens < sim.coldFreshSubagentTotalTokens * 0.35);
  });
});
