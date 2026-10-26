import path from "node:path";
import { evaluateAdapters } from "./scan-adapters.js";
import { findCloneFindings } from "./scan-clones.js";
import { evaluateCve } from "./scan-cve.js";
import { readChangeSet } from "./scan-diff.js";
import { findSecurityFindings } from "./scan-security.js";
import { parseHookInput } from "./scan-hooks.js";
import type { AddedLine, ScanCheck, ScanIo, ScanReport } from "./scan-model.js";
import { findSecretFindings } from "./scan-secrets.js";
import { formatReuseReport } from "./reuse-audit.js";
import { auditRepository } from "./reuse-scan.js";
import { DEFAULT_REUSE_AUDIT_OPTIONS } from "./reuse-model.js";

export interface ScanRequest {
  readonly root: string;
  readonly base: string | null;
  readonly hook: boolean;
  readonly stdin: string;
}

export function runProjectScan(request: ScanRequest, io: ScanIo): ScanReport {
  const hookInput = request.hook ? parseHookInput(request.stdin) : null;
  const root = hookInput?.workspaceRoot ?? request.root;
  const base = request.base ?? resolveBase(root, io);
  const change = readChangeSet(root, base, io);
  const checks: ScanCheck[] = [
    reuseCheck(root, base),
    cloneCheck(root, change.added),
    secretCheck(change.added),
    securityCheck(change.added),
    evaluateCve(root, change.files, io),
    evaluateAdapters(root, io),
  ];
  return {
    checks,
    blocked: checks.some((check) => check.status !== "pass"),
  };
}

function resolveBase(root: string, io: ScanIo): string {
  const verify = io.run(
    "git",
    ["-C", root, "rev-parse", "--verify", "--quiet", "origin/main"],
    root,
  );
  if (verify.exitCode !== 0) {
    return "HEAD";
  }
  const merge = io.run("git", ["-C", root, "merge-base", "HEAD", "origin/main"], root);
  const sha = merge.stdout.trim();
  if (merge.exitCode !== 0 || sha.length === 0) {
    return "HEAD";
  }
  return sha;
}

function reuseCheck(root: string, base: string): ScanCheck {
  const report = auditRepository({
    root,
    base,
    includeTests: false,
    dbPath: path.join(root, ".apex", "reuse-index.sqlite"),
    options: DEFAULT_REUSE_AUDIT_OPTIONS,
  });
  if (report.findings.length > 0) {
    return { id: "reuse", status: "fail", summary: formatReuseReport(report).trim() };
  }
  return {
    id: "reuse",
    status: "pass",
    summary: `${report.candidateCount} new symbol(s) checked against ${report.poolCount}.`,
  };
}

function cloneCheck(root: string, lines: readonly AddedLine[]): ScanCheck {
  const findings = findCloneFindings(root, lines);
  if (findings.length === 0) {
    return { id: "clones", status: "pass", summary: "No copied token block in the diff." };
  }
  const details = findings
    .map(
      (finding) =>
        `${finding.file}:${finding.line} copies ${finding.otherFile}:${finding.otherLine}. Call the existing block.`,
    )
    .join(" ");
  return { id: "clones", status: "fail", summary: details };
}

function securityCheck(lines: readonly AddedLine[]): ScanCheck {
  const findings = findSecurityFindings(lines).slice(0, 50);
  if (findings.length === 0) {
    return { id: "security", status: "pass", summary: "No dangerous sink in the diff." };
  }
  const details = findings
    .map((finding) => `${finding.file}:${finding.line} ${finding.rule}. ${finding.summary}`)
    .join(" ");
  return { id: "security", status: "fail", summary: details };
}

function secretCheck(lines: readonly AddedLine[]): ScanCheck {
  const findings = findSecretFindings(lines).slice(0, 50);
  if (findings.length === 0) {
    return { id: "secrets", status: "pass", summary: "No credential pattern in the diff." };
  }
  const details = findings
    .map(
      (finding) =>
        `${finding.file}:${finding.line} matches ${finding.pattern}. Remove it and rotate the credential.`,
    )
    .join(" ");
  return { id: "secrets", status: "fail", summary: details };
}
