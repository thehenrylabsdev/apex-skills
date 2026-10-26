import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { auditReuse, formatReuseReport, selectCandidateSymbols } from "./reuse-audit.js";
import {
  extractReuseSymbols,
  isTestPath,
  languageFromPath,
} from "./reuse-extract.js";
import { openReuseLedger } from "./reuse-ledger.js";
import {
  DEFAULT_REUSE_AUDIT_OPTIONS,
  type ReuseAuditOptions,
  type ReuseAuditReport,
  type ReuseSymbol,
} from "./reuse-model.js";

const SKIP_DIRECTORIES = new Set<string>([
  ".git",
  ".next",
  ".gradle",
  ".apex",
  "node_modules",
  "dist",
  "dist-test",
  "build",
  "target",
  "coverage",
  "vendor",
  "generated",
  "out",
]);

const MAX_SOURCE_BYTES = 1_048_576;

export interface ReuseScanRequest {
  readonly root: string;
  readonly base: string | null;
  readonly includeTests: boolean;
  readonly dbPath: string | null;
  readonly options: ReuseAuditOptions;
}

export function auditRepository(request: ReuseScanRequest): ReuseAuditReport {
  const files = listSourceFiles(request.root, request.includeTests);
  const current = loadSymbols(request.root, files, request.dbPath);
  const changed = request.base === null ? files : changedSourceFiles(request.root, request.base);
  const changedSet = new Set(changed);
  const baseline: ReuseSymbol[] = [];
  if (request.base !== null) {
    for (const filePath of changed) {
      const previous = readBaseline(request.root, request.base, filePath);
      if (previous !== null) {
        baseline.push(...extractReuseSymbols(filePath, previous));
      }
    }
  }
  const pool = current.filter((symbol) => request.includeTests || !isTestPath(symbol.file));
  const currentChanged = pool.filter((symbol) => changedSet.has(symbol.file));
  const candidates =
    request.base === null
      ? currentChanged
      : selectCandidateSymbols(baseline, currentChanged);
  return auditReuse(candidates, pool, request.options);
}

export function lookupSymbols(
  root: string,
  query: { readonly literal: string | null; readonly name: string | null },
): readonly ReuseSymbol[] {
  const files = listSourceFiles(root, false);
  const symbols = loadSymbols(root, files, path.join(root, ".apex", "reuse-index.sqlite"));
  return symbols.filter((symbol) => {
    if (symbol.kind === "literal") {
      return false;
    }
    const literalMatch =
      query.literal !== null && (symbol.literalValue?.includes(query.literal) ?? false);
    const nameMatch =
      query.name !== null && symbol.name.toLowerCase().includes(query.name.toLowerCase());
    if (query.literal !== null && query.name !== null) {
      return literalMatch || nameMatch;
    }
    return literalMatch || nameMatch;
  });
}

export function formatLookup(symbols: readonly ReuseSymbol[]): string {
  if (symbols.length === 0) {
    return "NO_CANONICAL\n";
  }
  return `${symbols
    .map(
      (symbol) =>
        `${symbol.kind} ${symbol.file}:${symbol.startLine} ${symbol.name}${
          symbol.literalValue === null ? "" : `=${JSON.stringify(symbol.literalValue)}`
        }`,
    )
    .join("\n")}\n`;
}

export function formatAudit(report: ReuseAuditReport): string {
  return formatReuseReport(report);
}

export function syncRepositoryIndex(root: string, dbPath: string): number {
  const files = listSourceFiles(root, false);
  return loadSymbols(root, files, dbPath).length;
}

export function defaultReuseOptions(): ReuseAuditOptions {
  return DEFAULT_REUSE_AUDIT_OPTIONS;
}

function loadSymbols(
  root: string,
  files: readonly string[],
  dbPath: string | null,
): readonly ReuseSymbol[] {
  const ledger = dbPath === null ? null : openReuseLedger(dbPath);
  const live = new Set(files);
  try {
    if (ledger !== null) {
      for (const stored of ledger.listFiles()) {
        if (!live.has(stored)) {
          ledger.deleteFile(stored);
        }
      }
    }
    const symbols: ReuseSymbol[] = [];
    for (const filePath of files) {
      const absolute = path.join(root, filePath);
      const source = readFileSync(absolute, "utf8");
      const contentHash = createHash("sha256").update(source).digest("hex");
      if (ledger !== null && ledger.readFileHash(filePath) === contentHash) {
        symbols.push(...ledger.readSymbols(filePath));
        continue;
      }
      const extracted = extractReuseSymbols(filePath, source);
      ledger?.replaceFile(filePath, contentHash, extracted);
      symbols.push(...extracted);
    }
    return symbols;
  } finally {
    ledger?.close();
  }
}

function listSourceFiles(root: string, includeTests: boolean): readonly string[] {
  const files: string[] = [];
  function walk(directory: string): void {
    for (const entry of readdirSync(directory)) {
      if (SKIP_DIRECTORIES.has(entry)) {
        continue;
      }
      const absolute = path.join(directory, entry);
      const stat = statSync(absolute);
      if (stat.isDirectory()) {
        walk(absolute);
        continue;
      }
      if (!stat.isFile() || stat.size > MAX_SOURCE_BYTES) {
        continue;
      }
      const relative = path.relative(root, absolute).replace(/\\/g, "/");
      if (languageFromPath(relative) === null) {
        continue;
      }
      if (!includeTests && isTestPath(relative)) {
        continue;
      }
      files.push(relative);
    }
  }
  walk(root);
  files.sort();
  return files;
}

function changedSourceFiles(root: string, base: string): readonly string[] {
  const diff = gitLines(root, ["diff", "--name-only", base]);
  const untracked = gitLines(root, ["ls-files", "--others", "--exclude-standard"]);
  if (diff === null || untracked === null) {
    throw new Error(`Reuse audit requires a git repository to compare against ${base}.`);
  }
  const changed = new Set<string>();
  for (const filePath of [...diff, ...untracked]) {
    const normalized = filePath.replace(/\\/g, "/");
    if (languageFromPath(normalized) !== null) {
      changed.add(normalized);
    }
  }
  return [...changed].sort();
}

function readBaseline(root: string, base: string, filePath: string): string | null {
  try {
    return execFileSync("git", ["-C", root, "show", `${base}:${filePath}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

function gitLines(root: string, args: readonly string[]): readonly string[] | null {
  try {
    const output = execFileSync("git", ["-C", root, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  } catch {
    return null;
  }
}
