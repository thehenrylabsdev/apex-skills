import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type {
  CatalogValidationReport,
  RoutingEvalCase,
  RoutingEvalCaseResult,
  SkillMetadata,
  SkillValidationIssue,
} from "./types.js";

export const HARNESS_BUILTIN_COMMANDS = new Set<string>([
  "code-review",
  "review",
  "research",
  "prototype",
  "plan",
  "compact",
  "clear",
  "help",
  "init",
  "doctor",
  "bug",
  "login",
  "logout",
  "config",
  "memory",
  "status",
  "pr-comments",
  "release-notes",
]);

const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
const SKILL_TOOL_CALL_REGEX =
  /Call the Skill tool (?:with|for)\s+`([a-z0-9-]+)`/gi;
const MARKDOWN_LINK_REGEX = /\[[^\]]*\]\(([^)]+)\)/g;
const BACKTICK_PARENT_PATH_REGEX = /`(\.\.\/[^`\s]+)`/g;

const STOPWORDS = new Set<string>([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "before",
  "by",
  "can",
  "do",
  "for",
  "from",
  "how",
  "i",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "me",
  "my",
  "of",
  "on",
  "or",
  "our",
  "should",
  "so",
  "that",
  "the",
  "their",
  "them",
  "then",
  "this",
  "to",
  "up",
  "use",
  "user",
  "wants",
  "we",
  "when",
  "with",
  "you",
  "your",
]);

/**
 * Normalizes and stems a word token for deterministic lexical + intent scoring.
 */
export function stemToken(word: string): string {
  const clean = word.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (clean.length <= 3) {
    return clean;
  }
  if (clean.endsWith("ing") && clean.length > 5) {
    return clean.slice(0, -3);
  }
  if (clean.endsWith("ed") && clean.length > 4) {
    return clean.slice(0, -2);
  }
  if (clean.endsWith("es") && clean.length > 4) {
    return clean.slice(0, -2);
  }
  if (clean.endsWith("s") && !clean.endsWith("ss") && clean.length > 4) {
    return clean.slice(0, -1);
  }
  return clean;
}

export function tokenizeText(text: string): readonly string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9-]+/)
    .flatMap((part) => (part.includes("-") ? [part, ...part.split("-")] : [part]))
    .map((w) => stemToken(w))
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w));
}

/**
 * Parses a single skill directory (`SKILL.md` + optional `agents/openai.yaml`).
 */
export function parseSkillDirectory(skillDirPath: string): SkillMetadata {
  const folderName = path.basename(skillDirPath);
  const skillFilePath = path.join(skillDirPath, "SKILL.md");
  const rawContent = readFileSync(skillFilePath, "utf8");
  const totalBytes = Buffer.byteLength(rawContent, "utf8");
  const totalLines = rawContent.split(/\r?\n/).length;

  const fmMatch = FRONTMATTER_REGEX.exec(rawContent);
  const frontmatterRaw = fmMatch?.[1] ?? "";
  const bodyRaw = fmMatch?.[2] ?? rawContent;
  const frontmatterBytes = Buffer.byteLength(frontmatterRaw, "utf8");

  let name = "";
  let description = "";
  let disableModelInvocation = false;

  for (const line of frontmatterRaw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("name:")) {
      name = trimmed
        .slice("name:".length)
        .trim()
        .replace(/^["']|["']$/g, "");
    } else if (trimmed.startsWith("description:")) {
      description = trimmed
        .slice("description:".length)
        .trim()
        .replace(/^["']|["']$/g, "");
    } else if (trimmed.startsWith("disable-model-invocation:")) {
      const val = trimmed.slice("disable-model-invocation:".length).trim();
      disableModelInvocation = val === "true";
    }
  }

  const calledSkills: string[] = [];
  for (const callMatch of bodyRaw.matchAll(SKILL_TOOL_CALL_REGEX)) {
    const targetName = callMatch[1];
    if (targetName !== undefined && !calledSkills.includes(targetName)) {
      calledSkills.push(targetName);
    }
  }

  const externalRelativeLinks: string[] = [];
  for (const linkMatch of bodyRaw.matchAll(MARKDOWN_LINK_REGEX)) {
    const href = linkMatch[1]?.trim() ?? "";
    if (
      href.startsWith("../") ||
      href.includes("/../") ||
      href.startsWith("..\\")
    ) {
      externalRelativeLinks.push(href);
    }
  }
  for (const btMatch of bodyRaw.matchAll(BACKTICK_PARENT_PATH_REGEX)) {
    const relPath = btMatch[1]?.trim() ?? "";
    if (relPath.length > 0 && !externalRelativeLinks.includes(relPath)) {
      externalRelativeLinks.push(relPath);
    }
  }

  const openAiPath = path.join(skillDirPath, "agents", "openai.yaml");
  const hasOpenAiYaml = existsSync(openAiPath);
  let openAiAllowImplicit: boolean | undefined = undefined;
  if (hasOpenAiYaml) {
    const openAiContent = readFileSync(openAiPath, "utf8");
    if (openAiContent.includes("allow_implicit_invocation: false")) {
      openAiAllowImplicit = false;
    } else if (openAiContent.includes("allow_implicit_invocation: true")) {
      openAiAllowImplicit = true;
    }
  }

  return {
    name,
    description,
    disableModelInvocation,
    folderName,
    skillFilePath,
    frontmatterBytes,
    frontmatterTokensApprox: Math.ceil(frontmatterBytes / 4),
    totalBytes,
    totalLines,
    totalTokensApprox: Math.ceil(totalBytes / 4),
    calledSkills,
    externalRelativeLinks,
    hasOpenAiYaml,
    openAiAllowImplicit,
  };
}

/**
 * Discovers all skills recursively under `skillsRoot`.
 */
export function discoverSkills(skillsRoot: string): readonly SkillMetadata[] {
  if (!existsSync(skillsRoot)) {
    return [];
  }

  const results: SkillMetadata[] = [];

  function walk(currentDir: string): void {
    const entries = readdirSync(currentDir).sort();
    const hasSkillMd = entries.includes("SKILL.md");
    if (hasSkillMd) {
      results.push(parseSkillDirectory(currentDir));
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry);
      if (statSync(fullPath).isDirectory()) {
        walk(fullPath);
      }
    }
  }

  walk(skillsRoot);
  return results;
}

/**
 * Evaluates a user prompt against all model-invoked skills.
 */
export function scorePromptAgainstSkills(
  prompt: string,
  modelInvokedSkills: readonly SkillMetadata[],
): readonly { readonly name: string; readonly score: number }[] {
  const promptTokens = tokenizeText(prompt);
  const promptLower = prompt.toLowerCase();

  const scored = modelInvokedSkills.map((skill) => {
    const descTokens = new Set(tokenizeText(skill.description));
    let score = 0;

    for (const token of promptTokens) {
      if (descTokens.has(token)) {
        score += 3;
      }
    }

    // Phrase & bigram matches against description
    const words = promptLower
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2);
    const descLower = skill.description.toLowerCase();

    for (let i = 0; i < words.length - 1; i += 1) {
      const w1 = words[i];
      const w2 = words[i + 1];
      if (w1 !== undefined && w2 !== undefined) {
        const bigram = `${w1} ${w2}`;
        if (descLower.includes(bigram)) {
          score += 5;
        }
      }
    }

    return { name: skill.name, score };
  });

  return [...scored].sort((a, b) => b.score - a.score);
}

/**
 * Runs the 4-Tier Validation & Routing Suite against a skill catalog.
 */
export function validateSkillCatalog(
  skillsRoot: string,
  evalCases: readonly RoutingEvalCase[],
  tokenCeiling = 600,
): CatalogValidationReport {
  const skills = discoverSkills(skillsRoot);
  const issues: SkillValidationIssue[] = [];

  const skillsByName = new Map<string, SkillMetadata>();
  for (const skill of skills) {
    skillsByName.set(skill.name, skill);
  }

  const modelInvokedSkills = skills.filter((s) => !s.disableModelInvocation);
  const userInvokedSkills = skills.filter((s) => s.disableModelInvocation);

  const alwaysLoadedBytes = modelInvokedSkills.reduce(
    (sum, s) => sum + s.frontmatterBytes,
    0,
  );
  const alwaysLoadedTokensApprox = Math.ceil(alwaysLoadedBytes / 4);

  // Tier 1 & Tier 2 per-skill checks
  for (const skill of skills) {
    if (skill.name.length === 0) {
      issues.push({
        severity: "ERROR",
        tier: "TIER1_STRUCTURE",
        skillName: skill.folderName,
        code: "MISSING_NAME",
        message: `Skill in folder "${skill.folderName}" is missing a frontmatter 'name' field.`,
      });
    } else if (skill.name !== skill.folderName) {
      issues.push({
        severity: "ERROR",
        tier: "TIER1_STRUCTURE",
        skillName: skill.name,
        code: "NAME_FOLDER_MISMATCH",
        message: `Skill name "${skill.name}" does not match directory name "${skill.folderName}".`,
      });
    }

    if (skill.description.length < 20) {
      issues.push({
        severity: "ERROR",
        tier: "TIER1_STRUCTURE",
        skillName: skill.name,
        code: "SHORT_DESCRIPTION",
        message: `Skill "${skill.name}" has a missing or overly short description (${skill.description.length} chars).`,
      });
    }

    if (skill.externalRelativeLinks.length > 0) {
      issues.push({
        severity: "ERROR",
        tier: "TIER1_STRUCTURE",
        skillName: skill.name,
        code: "BROKEN_STANDALONE_PORTABILITY",
        message: `Skill "${skill.name}" contains relative links escaping its folder (${skill.externalRelativeLinks.join(", ")}), which breaks standalone 'npx skills add --skill' installs (Issue #361).`,
      });
    }

    if (!skill.hasOpenAiYaml) {
      issues.push({
        severity: "ERROR",
        tier: "TIER1_STRUCTURE",
        skillName: skill.name,
        code: "MISSING_OPENAI_YAML",
        message: `Skill "${skill.name}" is missing agents/openai.yaml for Codex compatibility.`,
      });
    } else if (
      skill.disableModelInvocation &&
      skill.openAiAllowImplicit !== false
    ) {
      issues.push({
        severity: "ERROR",
        tier: "TIER1_STRUCTURE",
        skillName: skill.name,
        code: "OPENAI_POLICY_DRIFT",
        message: `User-invoked skill "${skill.name}" sets disable-model-invocation: true but agents/openai.yaml does not set allow_implicit_invocation: false.`,
      });
    }

    // Check cross-skill invocation invariants (Fixes Matt Pocock Issue #453 / PR #880)
    for (const targetName of skill.calledSkills) {
      const targetSkill = skillsByName.get(targetName);
      if (!targetSkill) {
        issues.push({
          severity: "ERROR",
          tier: "TIER1_STRUCTURE",
          skillName: skill.name,
          code: "UNKNOWN_CALLED_SKILL",
          message: `Skill "${skill.name}" instructs calling unknown skill "${targetName}".`,
        });
      } else if (targetSkill.disableModelInvocation) {
        issues.push({
          severity: "ERROR",
          tier: "TIER1_STRUCTURE",
          skillName: skill.name,
          code: "USER_INVOKED_SKILL_CALL",
          message: `Skill "${skill.name}" instructs calling "${targetName}" via the Skill tool, but "${targetName}" has disable-model-invocation: true (Issue #453 invariant violation).`,
        });
      }
    }

    // Check subagent recursion leaf guard (Fixes Matt Pocock Issues #530 & #573)
    const rawBody = readFileSync(skill.skillFilePath, "utf8");
    const mentionsSubagent = /\bsub-?agents?\b/i.test(rawBody);
    const hasLeafGuard = /LEAF-AGENT GUARD/i.test(rawBody);
    if (!skill.disableModelInvocation && mentionsSubagent && !hasLeafGuard) {
      issues.push({
        severity: "ERROR",
        tier: "TIER1_STRUCTURE",
        skillName: skill.name,
        code: "MISSING_SUBAGENT_LEAF_GUARD",
        message: `Model-invoked skill "${skill.name}" spawns subagents without a mandatory 'LEAF-AGENT GUARD' clause to prevent 2^N recursive skill invocation (Issues #530, #573).`,
      });
    }

    // Tier 2 per-skill body token ceiling
    if (skill.totalTokensApprox > 1800) {
      issues.push({
        severity: "ERROR",
        tier: "TIER2_BUDGET",
        skillName: skill.name,
        code: "SKILL_TOKEN_BLOAT",
        message: `Skill "${skill.name}" exceeds the 1,800-token Smart-Zone ceiling (${skill.totalTokensApprox} tokens).`,
      });
    }

    // Tier 3 namespace collision check (Fixes Matt Pocock Issues #423, #483, #857, #1019, #1037)
    if (HARNESS_BUILTIN_COMMANDS.has(skill.name)) {
      issues.push({
        severity: "ERROR",
        tier: "TIER3_ROUTING",
        skillName: skill.name,
        code: "HARNESS_COMMAND_COLLISION",
        message: `Skill "${skill.name}" collides with a built-in harness command (Issues #423, #857, #1019).`,
      });
    }
  }

  // Tier 2 global cold-start ceiling check
  if (alwaysLoadedTokensApprox > tokenCeiling) {
    issues.push({
      severity: "ERROR",
      tier: "TIER2_BUDGET",
      skillName: "GLOBAL_CATALOG",
      code: "COLD_START_BUDGET_EXCEEDED",
      message: `Always-loaded frontmatter tokens (${alwaysLoadedTokensApprox}) exceed the strict ${tokenCeiling}-token ceiling.`,
    });
  }

  // Tier 3 routing evaluation
  const routingResults: RoutingEvalCaseResult[] = evalCases.map((evalCase) => {
    const ranked = scorePromptAgainstSkills(
      evalCase.prompt,
      modelInvokedSkills,
    );
    const top = ranked[0];
    const topSkill = top && top.score > 0 ? top.name : "NONE";
    const topScore = top?.score ?? 0;
    const secondScore = ranked[1]?.score ?? 0;

    const forbiddenTriggered = evalCase.forbiddenSkills.includes(topSkill);
    const passed =
      topSkill === evalCase.expectedSkill &&
      topScore > secondScore &&
      !forbiddenTriggered;

    if (!passed) {
      issues.push({
        severity: "ERROR",
        tier: "TIER3_ROUTING",
        skillName: evalCase.expectedSkill,
        code: "ROUTING_EVAL_FAILURE",
        message: `Eval "${evalCase.id}" failed: expected "${evalCase.expectedSkill}", got "${topSkill}" (topScore=${topScore}, secondScore=${secondScore}).`,
      });
    }

    return {
      evalCase,
      rankedSkills: ranked,
      passed,
      topSkill,
    };
  });

  const routingPassCount = routingResults.filter((r) => r.passed).length;

  return {
    passed: issues.length === 0,
    totalSkills: skills.length,
    modelInvokedCount: modelInvokedSkills.length,
    userInvokedCount: userInvokedSkills.length,
    alwaysLoadedBytes,
    alwaysLoadedTokensApprox,
    tokenCeiling,
    issues,
    routingPassCount,
    routingTotalCount: routingResults.length,
    routingResults,
  };
}
