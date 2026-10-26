import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { AddedLine } from "./scan-model.js";
import { isScannableTextPath } from "./scan-secrets.js";

export interface CloneFinding {
  readonly file: string;
  readonly line: number;
  readonly otherFile: string;
  readonly otherLine: number;
}

const WINDOW = 24;
const MIN_LINES = 4;
const SOURCE_EXT =
  /\.(?:java|kt|kts|cs|go|swift|rs|php|py|rb|c|cc|cpp|h|hpp|m|mm|js|jsx|mjs|cjs|ts|tsx|vue|gd|lua|scala|css|scss|html)$/i;

const SKIP_LINE =
  /^\s*(?:import |using |package |#include |require\(|from |export \*|export \{)/;

interface TokenWindow {
  readonly file: string;
  readonly line: number;
  readonly hash: string;
}

interface SourceFile {
  readonly file: string;
  readonly text: string;
}

export function findCloneFindings(
  root: string,
  added: readonly AddedLine[],
): readonly CloneFinding[] {
  const addedKeys = new Set(added.map((line) => lineKey(line.file, line.line)));
  return matchCloneWindows(readCorpus(root), addedKeys).slice(0, 20);
}

export function matchCloneWindows(
  files: readonly SourceFile[],
  addedKeys: ReadonlySet<string>,
): readonly CloneFinding[] {
  const windows: TokenWindow[] = [];
  for (const file of files) {
    windows.push(...windowsFor(file.file, file.text));
  }
  const byHash = new Map<string, TokenWindow[]>();
  for (const item of windows) {
    const group = byHash.get(item.hash);
    if (group === undefined) {
      byHash.set(item.hash, [item]);
    } else {
      group.push(item);
    }
  }
  const findings: CloneFinding[] = [];
  const seen = new Set<string>();
  for (const group of byHash.values()) {
    if (group.length < 2) {
      continue;
    }
    const addedWindow = group.find((item) => addedKeys.has(lineKey(item.file, item.line)));
    const other = group.find((item) => item !== addedWindow);
    if (addedWindow === undefined || other === undefined) {
      continue;
    }
    if (addedWindow.file === other.file) {
      continue;
    }
    const id = `${addedWindow.file}:${addedWindow.line}:${other.file}:${other.line}`;
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    findings.push({
      file: addedWindow.file,
      line: addedWindow.line,
      otherFile: other.file,
      otherLine: other.line,
    });
  }
  return findings;
}

function windowsFor(file: string, text: string): readonly TokenWindow[] {
  const tokens: { readonly line: number; readonly text: string }[] = [];
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined || SKIP_LINE.test(line) || line.trim().startsWith("//")) {
      continue;
    }
    for (const token of line.match(/[A-Za-z_][A-Za-z0-9_]*|\d+|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g) ?? []) {
      tokens.push({ line: index + 1, text: token });
    }
  }
  const windows: TokenWindow[] = [];
  for (let start = 0; start + WINDOW <= tokens.length; start += 1) {
    const slice = tokens.slice(start, start + WINDOW);
    const first = slice[0];
    const last = slice[WINDOW - 1];
    if (first === undefined || last === undefined || last.line - first.line + 1 < MIN_LINES) {
      continue;
    }
    const hash = createHash("sha256")
      .update(slice.map((token) => token.text).join(" "))
      .digest("hex")
      .slice(0, 16);
    windows.push({ file, line: first.line, hash });
  }
  return windows;
}

function readCorpus(root: string): readonly SourceFile[] {
  const files: SourceFile[] = [];
  walk(root, root, files);
  return files;
}

function walk(root: string, directory: string, files: SourceFile[]): void {
  const entries = readDir(directory);
  if (entries === null) {
    return;
  }
  for (const entry of entries) {
    const absolute = path.join(directory, entry);
    let info: ReturnType<typeof statSync>;
    try {
      info = statSync(absolute);
    } catch {
      continue;
    }
    if (info.isDirectory()) {
      if (isSkippedDir(entry)) {
        continue;
      }
      walk(root, absolute, files);
      continue;
    }
    if (!info.isFile() || info.size > 1_048_576) {
      continue;
    }
    const relative = path.relative(root, absolute).replace(/\\/g, "/");
    if (!isClonePath(relative)) {
      continue;
    }
    files.push({ file: relative, text: readFileSync(absolute, "utf8") });
  }
}

function readDir(directory: string): readonly string[] | null {
  try {
    return readdirSync(directory);
  } catch {
    return null;
  }
}

function isClonePath(file: string): boolean {
  if (!isScannableTextPath(file) || !SOURCE_EXT.test(file)) {
    return false;
  }
  return !/\/(?:test|tests|__tests__)(?:\/|$)/.test(file) && !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file);
}

function isSkippedDir(name: string): boolean {
  return (
    name === "node_modules" ||
    name === "dist" ||
    name === "build" ||
    name === "coverage" ||
    name === "vendor" ||
    name === ".git" ||
    name === ".next" ||
    name === ".gradle" ||
    name === "target" ||
    name === ".apex"
  );
}

function lineKey(file: string, line: number): string {
  return `${file}:${line}`;
}
