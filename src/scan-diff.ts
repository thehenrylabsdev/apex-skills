import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { AddedLine, ScanIo } from "./scan-model.js";

const MAX_BYTES = 1_048_576;

const NPM_MANIFEST =
  /(?:^|\/)(?:package\.json|package-lock\.json|npm-shrinkwrap\.json)$/;

const OSV_MANIFEST =
  /(?:^|\/)(?:pom\.xml|build\.gradle(?:\.kts)?|go\.mod|go\.sum|requirements\.txt|poetry\.lock|Cargo\.lock|Cargo\.toml|pyproject\.toml|composer\.lock|Gemfile\.lock)$/;

export function parseUnifiedDiff(diff: string): readonly AddedLine[] {
  const added: AddedLine[] = [];
  let file: string | null = null;
  let newLine = 0;
  for (const raw of diff.split(/\r?\n/)) {
    if (raw.startsWith("diff ") || raw.startsWith("index ") || raw.startsWith("--- ")) {
      continue;
    }
    if (raw.startsWith("+++ ")) {
      file = parseDiffPath(raw.slice(4).trim());
      newLine = 0;
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (hunk?.[1] !== undefined) {
      newLine = Number(hunk[1]);
      continue;
    }
    if (file === null || newLine === 0 || !raw.startsWith("+")) {
      continue;
    }
    added.push({ file, line: newLine, text: raw.slice(1) });
    newLine += 1;
  }
  return added;
}

export function readChangeSet(
  root: string,
  base: string,
  io: ScanIo,
): { readonly added: readonly AddedLine[]; readonly files: readonly string[] } {
  const diff = io.run("git", ["-C", root, "diff", "-U0", "--no-color", base, "--"], root);
  if (diff.exitCode !== 0) {
    throw new Error(`Project scan requires git to diff against ${base}.`);
  }
  const listed = gitLines(io, root, ["diff", "--name-only", "--diff-filter=ACMR", base, "--"]);
  const untracked = gitLines(io, root, ["ls-files", "--others", "--exclude-standard"]);
  const files = [...new Set([...listed, ...untracked])].sort();
  const added = [...parseUnifiedDiff(diff.stdout)];
  for (const file of untracked) {
    added.push(...readUntracked(root, file));
  }
  return { added, files };
}

export function isNpmManifest(file: string): boolean {
  return matchesManifest(file, NPM_MANIFEST);
}

export function isOsvManifest(file: string): boolean {
  return matchesManifest(file, OSV_MANIFEST);
}

function matchesManifest(file: string, expression: RegExp): boolean {
  return expression.test(file.replace(/\\/g, "/"));
}

function parseDiffPath(raw: string): string | null {
  if (raw === "/dev/null") {
    return null;
  }
  const quoted = raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw;
  return quoted.startsWith("b/") ? quoted.slice(2) : quoted;
}

function gitLines(io: ScanIo, root: string, args: readonly string[]): readonly string[] {
  const result = io.run("git", ["-C", root, ...args], root);
  if (result.exitCode !== 0) {
    throw new Error("Project scan requires a git repository.");
  }
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function readUntracked(root: string, file: string): readonly AddedLine[] {
  const absolute = path.join(root, file);
  try {
    if (statSync(absolute).size > MAX_BYTES) {
      return [];
    }
    const source = readFileSync(absolute, "utf8");
    if (source.includes("\u0000")) {
      return [];
    }
    return source.split(/\r?\n/).map((text, index) => ({
      file: file.replace(/\\/g, "/"),
      line: index + 1,
      text,
    }));
  } catch {
    return [];
  }
}
