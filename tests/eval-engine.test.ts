import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { analyzeRepositoryMetrics } from "../src/benchmark.js";
import { validateSkillCatalog } from "../src/eval-engine.js";
import type { RoutingEvalCase } from "../src/types.js";

void describe("FourTierEvalEngine & CrossRepoBenchmark", () => {
  const repoRoot = process.cwd();
  const skillsRoot = path.join(repoRoot, "skills");
  const evalsPath = path.join(repoRoot, "evals", "routing-benchmark.json");

  void it("passes all Tier 1 (Structure/Portability), Tier 2 (<600 Token Budget), and Tier 3 (28/28 Routing) checks", () => {
    const evalCases = JSON.parse(
      readFileSync(evalsPath, "utf8"),
    ) as readonly RoutingEvalCase[];

    const report = validateSkillCatalog(skillsRoot, evalCases, 600);
    assert.equal(report.passed, true, JSON.stringify(report.issues, null, 2));
    assert.equal(report.totalSkills, 17);
    assert.equal(report.modelInvokedCount, 7);
    assert.equal(report.userInvokedCount, 10);
    assert.ok(
      report.alwaysLoadedTokensApprox < 600,
      `Expected < 600 tokens, got ${report.alwaysLoadedTokensApprox}`,
    );
    assert.equal(report.routingPassCount, 28);
    assert.equal(report.routingTotalCount, 28);
  });

  void it("analyzes apex-skills repository metrics with zero safety violations", () => {
    const metrics = analyzeRepositoryMetrics("apex-skills", repoRoot);
    assert.equal(metrics.skillCount, 17);
    assert.equal(metrics.brokenStandaloneSkillLinks, 0);
    assert.equal(metrics.harnessBuiltInCollisions, 0);
    assert.equal(metrics.unguardedRecursiveSubagentSkills, 0);
    assert.ok(metrics.coldStartTokensApprox < 300);
  });
});
