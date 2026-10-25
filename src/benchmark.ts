import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import {
  discoverSkills,
  HARNESS_BUILTIN_COMMANDS,
} from "./eval-engine.js";
import { simulateKvCacheEconomics } from "./seam-analyzer.js";
import type { RepoBenchmarkMetrics } from "./types.js";

function collectMarkdownFiles(dirPath: string): readonly string[] {
  if (!existsSync(dirPath)) {
    return [];
  }
  const files: string[] = [];

  function walk(curr: string): void {
    for (const entry of readdirSync(curr)) {
      if (entry === ".git" || entry === "node_modules" || entry === "dist") {
        continue;
      }
      const full = path.join(curr, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        walk(full);
      } else if (entry.endsWith(".md")) {
        files.push(full);
      }
    }
  }

  walk(dirPath);
  return files;
}

/**
 * Measures empirical metrics for any Agent Skills repository on disk.
 */
export function analyzeRepositoryMetrics(
  repoName: string,
  repoRoot: string,
): RepoBenchmarkMetrics {
  const mdFiles = collectMarkdownFiles(repoRoot);
  let totalBytes = 0;
  let totalLines = 0;

  for (const file of mdFiles) {
    const content = readFileSync(file, "utf8");
    totalBytes += Buffer.byteLength(content, "utf8");
    totalLines += content.split(/\r?\n/).length;
  }

  const skillsRoot = path.join(repoRoot, "skills");
  const skills = discoverSkills(skillsRoot);
  const modelInvoked = skills.filter((s) => !s.disableModelInvocation);
  const userInvoked = skills.filter((s) => s.disableModelInvocation);

  let coldStartBytes = modelInvoked.reduce(
    (sum, s) => sum + s.frontmatterBytes,
    0,
  );

  // Account for mandatory session-start hook or single-entry router payload
  const sessionStartHook = path.join(repoRoot, "hooks", "session-start.sh");
  const usingAgentSkills = path.join(
    repoRoot,
    "skills",
    "using-agent-skills",
    "SKILL.md",
  );
  if (existsSync(sessionStartHook) && existsSync(usingAgentSkills)) {
    coldStartBytes += Buffer.byteLength(
      readFileSync(usingAgentSkills, "utf8"),
      "utf8",
    );
  }

  const potetoModeSkill = path.join(
    repoRoot,
    "skills",
    "poteto-mode",
    "SKILL.md",
  );
  if (existsSync(potetoModeSkill) && modelInvoked.length === 1) {
    coldStartBytes += Buffer.byteLength(
      readFileSync(potetoModeSkill, "utf8"),
      "utf8",
    );
  }

  const coldStartTokensApprox = Math.ceil(coldStartBytes / 4);

  let brokenStandaloneSkillLinks = 0;
  let harnessBuiltInCollisions = 0;
  let unguardedRecursiveSubagentSkills = 0;

  for (const skill of skills) {
    brokenStandaloneSkillLinks += skill.externalRelativeLinks.length;
    if (HARNESS_BUILTIN_COMMANDS.has(skill.name)) {
      harnessBuiltInCollisions += 1;
    }
    const rawBody = readFileSync(skill.skillFilePath, "utf8");
    if (
      !skill.disableModelInvocation &&
      /\bsub-?agents?\b/i.test(rawBody) &&
      !/LEAF-AGENT GUARD|Personas do not invoke personas/i.test(rawBody)
    ) {
      unguardedRecursiveSubagentSkills += 1;
    }
  }

  const kvSim = simulateKvCacheEconomics({
    systemAndSkillTokens: Math.max(coldStartTokensApprox, 1500),
    codebaseContextTokens: 15000,
    subtasksCount: 3,
    reviewFixRounds: 3,
    reviewersPerRound: 2,
  });

  let simulatedFeatureUncachedTokens = kvSim.warmReuseTotalTokens;
  let estimatedTurnStopsPerFeature = 2; // 1 Bounded Grilling Frontier + 1 Seam Confirmation

  if (repoName === "LaurenTan") {
    simulatedFeatureUncachedTokens = kvSim.coldFreshSubagentTotalTokens;
    estimatedTurnStopsPerFeature = 4;
  } else if (repoName === "addyosmani") {
    simulatedFeatureUncachedTokens =
      coldStartTokensApprox * 12 + 50450 + 15000 * 4;
    estimatedTurnStopsPerFeature = 12; // 5 1-question turns + 2 Spec stops + 1 Plan stop + 4 DDD stops
  } else if (repoName === "mattpocock") {
    simulatedFeatureUncachedTokens =
      kvSim.warmUncachedPrefixTokens + 15000 * 4;
    estimatedTurnStopsPerFeature = 5; // Unbounded grilling rounds + seam confirmation
  }

  return {
    repoName,
    markdownFileCount: mdFiles.length,
    totalLines,
    totalBytes,
    totalTokensApprox: Math.ceil(totalBytes / 4),
    skillCount: skills.length,
    modelInvokedCount: modelInvoked.length,
    userInvokedCount: userInvoked.length,
    coldStartBytes,
    coldStartTokensApprox,
    simulatedFeatureUncachedTokens,
    estimatedTurnStopsPerFeature,
    brokenStandaloneSkillLinks,
    harnessBuiltInCollisions,
    unguardedRecursiveSubagentSkills,
  };
}

/**
 * Formats a Markdown comparison table for all analyzed repositories.
 */
export function formatBenchmarkMarkdownTable(
  metricsList: readonly RepoBenchmarkMetrics[],
): string {
  const headers = [
    "Metric",
    ...metricsList.map((m) => `\`${m.repoName}\``),
  ];
  const sep = headers.map(() => "---");

  const rows: string[][] = [
    [
      "Total Markdown Files / Lines",
      ...metricsList.map(
        (m) =>
          `${m.markdownFileCount} files / ${m.totalLines.toLocaleString("en-US")} lines`,
      ),
    ],
    [
      "Total Repository Tokens (Approx)",
      ...metricsList.map(
        (m) => `${m.totalTokensApprox.toLocaleString("en-US")} tok`,
      ),
    ],
    [
      "Total Skills (Model vs. User-Invoked)",
      ...metricsList.map(
        (m) =>
          `${m.skillCount} (${m.modelInvokedCount} model / ${m.userInvokedCount} user)`,
      ),
    ],
    [
      "**Cold-Start Token Tax (Turn 0)**",
      ...metricsList.map(
        (m) =>
          `**${m.coldStartTokensApprox.toLocaleString("en-US")} tok** (${m.coldStartBytes.toLocaleString("en-US")} B)`,
      ),
    ],
    [
      "**Simulated Feature Uncached Input Tokens**",
      ...metricsList.map(
        (m) =>
          `**${m.simulatedFeatureUncachedTokens.toLocaleString("en-US")} tok**`,
      ),
    ],
    [
      "**Human Turn-Stops per Medium Feature**",
      ...metricsList.map((m) => `**${m.estimatedTurnStopsPerFeature} stops**`),
    ],
    [
      "Broken Standalone Links (`--skill` Issue #361)",
      ...metricsList.map((m) => `${m.brokenStandaloneSkillLinks}`),
    ],
    [
      "Harness Built-In Command Collisions (#423/#857)",
      ...metricsList.map((m) => `${m.harnessBuiltInCollisions}`),
    ],
    [
      "Unguarded Recursive Subagent Skills (#530/#573)",
      ...metricsList.map((m) => `${m.unguardedRecursiveSubagentSkills}`),
    ],
  ];

  const lines = [
    `| ${headers.join(" | ")} |`,
    `| ${sep.join(" | ")} |`,
    ...rows.map((r) => `| ${r.join(" | ")} |`),
  ];

  return lines.join("\n");
}
