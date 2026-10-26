import path from "node:path";
import {
  auditRepository,
  formatAudit,
  formatLookup,
  lookupSymbols,
  syncRepositoryIndex,
} from "./reuse-scan.js";
import { DEFAULT_REUSE_AUDIT_OPTIONS, type ReuseAuditOptions } from "./reuse-model.js";

export function executeReuseCommand(args: readonly string[]): number {
  const parsed = parseReuseArgs(args);
  if (parsed === null) {
    process.stderr.write(
      "Usage: apex-skills reuse audit|index|lookup [--root dir] [--base ref] [--all] [--literal text] [--name symbol]\n",
    );
    return 2;
  }
  if (parsed.command === "index") {
    const count = syncRepositoryIndex(parsed.root, parsed.dbPath);
    process.stdout.write(`[Apex Reuse] Indexed ${count} symbol(s) into ${parsed.dbPath}\n`);
    return 0;
  }
  if (parsed.command === "lookup") {
    if (parsed.literal === null && parsed.name === null) {
      process.stderr.write("reuse lookup requires --literal or --name\n");
      return 2;
    }
    const matches = lookupSymbols(parsed.root, {
      literal: parsed.literal,
      name: parsed.name,
    });
    process.stdout.write(formatLookup(matches));
    return 0;
  }
  try {
    const report = auditRepository({
      root: parsed.root,
      base: parsed.all ? null : parsed.base,
      includeTests: parsed.includeTests,
      dbPath: parsed.dbPath,
      options: parsed.options,
    });
    process.stdout.write(formatAudit(report));
    return report.findings.length > 0 ? 1 : 0;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "reuse audit failed";
    process.stderr.write(`${message}\n`);
    return 2;
  }
}

interface ParsedReuseArgs {
  readonly command: "audit" | "index" | "lookup";
  readonly root: string;
  readonly base: string;
  readonly all: boolean;
  readonly dbPath: string;
  readonly literal: string | null;
  readonly name: string | null;
  readonly includeTests: boolean;
  readonly options: ReuseAuditOptions;
}

function parseReuseArgs(args: readonly string[]): ParsedReuseArgs | null {
  const command = args[0];
  if (command !== "audit" && command !== "index" && command !== "lookup") {
    return null;
  }
  let root = process.cwd();
  let base = "HEAD";
  let all = false;
  let literal: string | null = null;
  let name: string | null = null;
  let includeTests = false;
  let minBodyTokens = DEFAULT_REUSE_AUDIT_OPTIONS.minBodyTokens;
  let minSignificantTokens = DEFAULT_REUSE_AUDIT_OPTIONS.minSignificantTokens;
  let minLiteralLength = DEFAULT_REUSE_AUDIT_OPTIONS.minLiteralLength;
  let rawLiteralMinLength = DEFAULT_REUSE_AUDIT_OPTIONS.rawLiteralMinLength;
  for (let index = 1; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === "--all") {
      all = true;
      continue;
    }
    if (flag === "--include-tests") {
      includeTests = true;
      continue;
    }
    const value = args[index + 1];
    if (value === undefined) {
      return null;
    }
    if (flag === "--root") {
      root = path.resolve(value);
    } else if (flag === "--base") {
      base = value;
    } else if (flag === "--literal") {
      literal = value;
    } else if (flag === "--name") {
      name = value;
    } else if (flag === "--min-tokens") {
      const numeric = readPositive(value);
      if (numeric === null) {
        return null;
      }
      minBodyTokens = numeric;
    } else if (flag === "--min-significant") {
      const numeric = readPositive(value);
      if (numeric === null) {
        return null;
      }
      minSignificantTokens = numeric;
    } else if (flag === "--min-literal") {
      const numeric = readPositive(value);
      if (numeric === null) {
        return null;
      }
      minLiteralLength = numeric;
    } else if (flag === "--raw-literal-min") {
      const numeric = readPositive(value);
      if (numeric === null) {
        return null;
      }
      rawLiteralMinLength = numeric;
    } else {
      return null;
    }
    index += 1;
  }
  return {
    command,
    root,
    base,
    all,
    dbPath: path.join(root, ".apex", "reuse-index.sqlite"),
    literal,
    name,
    includeTests,
    options: {
      minBodyTokens,
      minFanoutTokens: DEFAULT_REUSE_AUDIT_OPTIONS.minFanoutTokens,
      minSignificantTokens,
      minLiteralLength,
      rawLiteralMinLength,
    },
  };
}

function readPositive(value: string): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}
