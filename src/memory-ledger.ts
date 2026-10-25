import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type {
  MemoryAuditReport,
  MemoryDriftState,
  MemoryEntryAuditResult,
  MemoryPinEntry,
} from "./types.js";

const PIN_PATTERN =
  /\[sha:([0-9a-fA-F]{7,40})\s*\|\s*scope:([^\]]+)\]\s*(.+)$/;

/**
 * Matches a file path against a scope pattern (supports exact paths, directory prefixes, and `*` / `**` globs).
 */
export function matchesScopePattern(
  filePath: string,
  scopePattern: string,
): boolean {
  const normFile = filePath.replace(/\\/g, "/").replace(/^\.\//, "");
  const normScope = scopePattern
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\//, "");

  if (normScope === "*" || normScope === "**" || normScope === "**/*") {
    return true;
  }

  if (!normScope.includes("*")) {
    if (normScope.endsWith("/")) {
      return normFile.startsWith(normScope);
    }
    return normFile === normScope || normFile.startsWith(`${normScope}/`);
  }

  const regexStr = normScope
    .split("**")
    .map((segment) =>
      segment
        .split("*")
        .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
        .join("[^/]*"),
    )
    .join(".*");

  const regex = new RegExp(`^${regexStr}$`);
  return regex.test(normFile);
}

/**
 * Parses commit-pinned memory claims from markdown content.
 * Format: `- [sha:a1b2c3d | scope:src/auth/**] Claim text explaining architectural invariant`
 */
export function parseMemoryPinEntries(
  markdownContent: string,
  sourceFileName: string,
): readonly MemoryPinEntry[] {
  const lines = markdownContent.split(/\r?\n/);
  const entries: MemoryPinEntry[] = [];

  lines.forEach((rawLine, index) => {
    const match = PIN_PATTERN.exec(rawLine.trim());
    if (!match) {
      return;
    }
    const commitSha = match[1];
    const scopePattern = match[2];
    const claimText = match[3];
    if (
      commitSha === undefined ||
      scopePattern === undefined ||
      claimText === undefined
    ) {
      return;
    }
    entries.push({
      id: `${sourceFileName}:L${index + 1}`,
      file: sourceFileName,
      line: index + 1,
      commitSha: commitSha.toLowerCase(),
      scopePattern: scopePattern.trim(),
      claimText: claimText.trim(),
    });
  });

  return entries;
}

/**
 * Pure deterministic evaluator that checks parsed memory entries against a map of
 * changed files since each commit SHA.
 */
export function evaluateMemoryEntries(
  entries: readonly MemoryPinEntry[],
  changedFilesBySha: ReadonlyMap<string, readonly string[] | null>,
): MemoryAuditReport {
  let validCount = 0;
  let driftedCount = 0;
  let unverifiableCount = 0;

  const results: MemoryEntryAuditResult[] = entries.map((entry) => {
    const changedSinceSha = changedFilesBySha.get(entry.commitSha);
    if (changedSinceSha === undefined || changedSinceSha === null) {
      unverifiableCount += 1;
      return {
        entry,
        state: "UNVERIFIABLE_SHA" satisfies MemoryDriftState,
        driftedFiles: [],
      };
    }

    const scopes = entry.scopePattern
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const driftedFiles = changedSinceSha.filter((changedFile) =>
      scopes.some((scope) => matchesScopePattern(changedFile, scope)),
    );

    if (driftedFiles.length > 0) {
      driftedCount += 1;
      return {
        entry,
        state: "DRIFTED" satisfies MemoryDriftState,
        driftedFiles,
      };
    }

    validCount += 1;
    return {
      entry,
      state: "VALID" satisfies MemoryDriftState,
      driftedFiles: [],
    };
  });

  return {
    totalEntries: entries.length,
    validCount,
    driftedCount,
    unverifiableCount,
    results,
  };
}

/**
 * Audits commit-pinned memory files (`DECISIONS.md`, `CONSTRAINTS.md`) against live Git history.
 */
export function auditRepositoryMemory(
  repoRoot: string,
  relativeFiles: readonly string[] = ["DECISIONS.md", "CONSTRAINTS.md"],
): MemoryAuditReport {
  const allEntries: MemoryPinEntry[] = [];

  for (const relFile of relativeFiles) {
    const absPath = path.join(repoRoot, relFile);
    if (!existsSync(absPath)) {
      continue;
    }
    const content = readFileSync(absPath, "utf8");
    const parsed = parseMemoryPinEntries(content, relFile);
    allEntries.push(...parsed);
  }

  const changedFilesBySha = new Map<string, readonly string[] | null>();

  for (const entry of allEntries) {
    if (changedFilesBySha.has(entry.commitSha)) {
      continue;
    }
    try {
      execFileSync(
        "git",
        ["-C", repoRoot, "cat-file", "-e", `${entry.commitSha}^{commit}`],
        { stdio: "ignore" },
      );
      const diffOutput = execFileSync(
        "git",
        ["-C", repoRoot, "diff", "--name-only", `${entry.commitSha}..HEAD`],
        { encoding: "utf8" },
      );
      const changed = diffOutput
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      changedFilesBySha.set(entry.commitSha, changed);
    } catch {
      changedFilesBySha.set(entry.commitSha, null);
    }
  }

  return evaluateMemoryEntries(allEntries, changedFilesBySha);
}
