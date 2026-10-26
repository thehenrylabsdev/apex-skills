import path from "node:path";
import { existsSync } from "node:fs";
import { isRecord } from "./json-record.js";
import type { ScanCheck, ScanIo } from "./scan-model.js";
import { isNpmManifest, isOsvManifest } from "./scan-diff.js";

interface AuditCounts {
  readonly high: number;
  readonly critical: number;
  readonly names: readonly string[];
}

export function evaluateCve(
  root: string,
  changedFiles: readonly string[],
  io: ScanIo,
): ScanCheck {
  const npmChanged = changedFiles.some((file) => isNpmManifest(file));
  const osvChanged = changedFiles.filter((file) => isOsvManifest(file));
  const parts: string[] = [];
  if (npmChanged) {
    const npm = auditNpm(root, io);
    if (npm.status !== "pass") {
      return npm;
    }
    parts.push(npm.summary);
  }
  if (osvChanged.length > 0) {
    const osv = auditOsv(root, osvChanged, io);
    if (osv.status !== "pass") {
      return {
        id: "cve",
        status: osv.status,
        summary: [...parts, osv.summary].join(" "),
      };
    }
    parts.push(osv.summary);
  }
  if (parts.length === 0) {
    return {
      id: "cve",
      status: "pass",
      summary: "No dependency manifest changed.",
    };
  }
  return { id: "cve", status: "pass", summary: parts.join(" ") };
}

export function parseNpmAudit(stdout: string): AuditCounts | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout) as unknown;
  } catch {
    return null;
  }
  if (!isRecord(parsed)) {
    return null;
  }
  const metadata = parsed["metadata"];
  if (!isRecord(metadata)) {
    return null;
  }
  const vulnerabilities = metadata["vulnerabilities"];
  if (!isRecord(vulnerabilities)) {
    return null;
  }
  const high = readCount(vulnerabilities["high"]);
  const critical = readCount(vulnerabilities["critical"]);
  if (high === null || critical === null) {
    return null;
  }
  return { high, critical, names: highSeverityNames(parsed["vulnerabilities"]) };
}

function auditNpm(root: string, io: ScanIo): ScanCheck {
  if (!existsSync(path.join(root, "package-lock.json"))) {
    return {
      id: "cve",
      status: "unavailable",
      summary: "package.json changed and package-lock.json is absent, so npm audit has no lockfile.",
    };
  }
  const result = io.run("npm", ["audit", "--json", "--audit-level=high"], root);
  const counts = parseNpmAudit(result.stdout);
  if (counts === null) {
    return {
      id: "cve",
      status: "unavailable",
      summary: "npm audit did not return a vulnerability report.",
    };
  }
  if (counts.high > 0 || counts.critical > 0) {
    const names = counts.names.length > 0 ? ` (${counts.names.join(", ")})` : "";
    return {
      id: "cve",
      status: "fail",
      summary: `npm audit found ${counts.critical} critical and ${counts.high} high advisories${names}. Upgrade the package before finishing.`,
    };
  }
  return {
    id: "cve",
    status: "pass",
    summary: "npm audit high=0 critical=0.",
  };
}

function auditOsv(root: string, manifests: readonly string[], io: ScanIo): ScanCheck {
  if (!io.commandExists("osv-scanner")) {
    return {
      id: "cve",
      status: "unavailable",
      summary: `osv-scanner is not on PATH. Changed manifests: ${manifests.join(", ")}.`,
    };
  }
  const args = ["scan", "source"];
  for (const manifest of manifests) {
    args.push("--lockfile", manifest);
  }
  const result = io.run("osv-scanner", args, root);
  if (result.exitCode === 0) {
    return { id: "cve", status: "pass", summary: "osv-scanner reported no vulnerabilities." };
  }
  return {
    id: "cve",
    status: "fail",
    summary: "osv-scanner reported vulnerabilities in a changed manifest. Upgrade the dependency before finishing.",
  };
}

function highSeverityNames(value: unknown): readonly string[] {
  if (!isRecord(value)) {
    return [];
  }
  const names: string[] = [];
  for (const entry of Object.values(value)) {
    if (!isRecord(entry)) {
      continue;
    }
    const severity = entry["severity"];
    const name = entry["name"];
    if (
      (severity === "high" || severity === "critical") &&
      typeof name === "string" &&
      !names.includes(name)
    ) {
      names.push(name);
    }
  }
  return names;
}

function readCount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
