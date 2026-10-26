#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  analyzeRepositoryMetrics,
  formatBenchmarkMarkdownTable,
} from "./benchmark.js";
import { validateSkillCatalog } from "./eval-engine.js";
import { auditRepositoryMemory } from "./memory-ledger.js";
import { executeReuseCommand } from "./reuse-cli.js";
import { executeHooksCommand, executeScanCommand } from "./scan-cli.js";
import type { RoutingEvalCase } from "./types.js";

function runValidate(repoRoot: string): number {
  const skillsRoot = path.join(repoRoot, "skills");
  const evalFilePath = path.join(repoRoot, "evals", "routing-benchmark.json");

  let evalCases: readonly RoutingEvalCase[] = [];
  if (existsSync(evalFilePath)) {
    evalCases = JSON.parse(
      readFileSync(evalFilePath, "utf8"),
    ) as readonly RoutingEvalCase[];
  }

  const report = validateSkillCatalog(skillsRoot, evalCases, 600);

  process.stdout.write(
    `[Apex Validator] Skills: ${report.totalSkills} (${report.modelInvokedCount} model-invoked, ${report.userInvokedCount} user-invoked)\n`,
  );
  process.stdout.write(
    `[Apex Validator] Cold-Start Budget: ${report.alwaysLoadedTokensApprox} / ${report.tokenCeiling} tokens (${report.alwaysLoadedBytes} bytes)\n`,
  );
  process.stdout.write(
    `[Apex Validator] Routing Evals: ${report.routingPassCount} / ${report.routingTotalCount} passed\n`,
  );

  if (report.issues.length > 0) {
    process.stderr.write(
      `\n[Apex Validator] FAILED with ${report.issues.length} issue(s):\n`,
    );
    for (const issue of report.issues) {
      process.stderr.write(
        `  - [${issue.tier}] (${issue.skillName}) ${issue.code}: ${issue.message}\n`,
      );
    }
    return 1;
  }

  process.stdout.write(
    "[Apex Validator] PASSED all 4-Tier Structural, Budget, Portability, and Routing Checks!\n",
  );
  return 0;
}

function runMemoryAudit(repoRoot: string): number {
  const report = auditRepositoryMemory(repoRoot);
  process.stdout.write(
    `[Apex Memory Audit] Checked ${report.totalEntries} commit-pinned claims: ${report.validCount} VALID, ${report.driftedCount} DRIFTED, ${report.unverifiableCount} UNVERIFIABLE\n`,
  );
  for (const res of report.results) {
    if (res.state !== "VALID") {
      process.stdout.write(
        `  - [${res.state}] ${res.entry.id} (sha:${res.entry.commitSha}, scope:${res.entry.scopePattern}): ${res.driftedFiles.join(", ")}\n`,
      );
    }
  }
  return report.driftedCount > 0 ? 1 : 0;
}

function runBenchmark(repoRoot: string): number {
  const workspaceParent = path.dirname(repoRoot);
  const candidates: readonly { readonly name: string; readonly dir: string }[] =
    [
      { name: "LaurenTan", dir: path.join(workspaceParent, "LaurenTan") },
      { name: "addyosmani", dir: path.join(workspaceParent, "addyosmani") },
      { name: "mattpocock", dir: path.join(workspaceParent, "mattpocock") },
      { name: "apex-skills", dir: repoRoot },
    ];

  const available = candidates.filter((c) => existsSync(c.dir));
  const metrics = available.map((c) => analyzeRepositoryMetrics(c.name, c.dir));

  process.stdout.write("\n=== 4-WAY EMPIRICAL BENCHMARK COMPARISON ===\n\n");
  process.stdout.write(`${formatBenchmarkMarkdownTable(metrics)}\n\n`);
  return 0;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] ?? "validate";
  const repoRoot = process.cwd();

  let exitCode: number;
  if (command === "validate") {
    exitCode = runValidate(repoRoot);
  } else if (command === "memory-audit") {
    exitCode = runMemoryAudit(repoRoot);
  } else if (command === "benchmark") {
    exitCode = runBenchmark(repoRoot);
  } else if (command === "versions") {
    const loaded = await import("./version-cli.js");
    exitCode = loaded.executeVersionCommand(args.slice(1));
  } else if (command === "reuse") {
    exitCode = executeReuseCommand(args.slice(1));
  } else if (command === "scan") {
    exitCode = executeScanCommand(args.slice(1));
  } else if (command === "hooks") {
    exitCode = executeHooksCommand(args.slice(1));
  } else {
    process.stderr.write(
      `Unknown command "${command}". Supported: validate | memory-audit | benchmark | versions | reuse | scan | hooks\n`,
    );
    exitCode = 1;
  }

  process.exitCode = exitCode;
}

void main();
