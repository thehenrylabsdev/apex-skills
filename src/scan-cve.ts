import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { isRecord } from "./json-record.js";
import type { ScanCheck, ScanIo } from "./scan-model.js";
import {
  isAdvisoryLockfile,
  isNpmManifest,
  isUnlockedManifest,
  LOCK,
  manifestHasLock,
} from "./scan-diff.js";

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
  const unlocked = changedFiles.filter(
    (file) => isUnlockedManifest(file) && !manifestHasLock(root, file),
  );
  const lockfiles = changedFiles.filter((file) => isAdvisoryLockfile(file));
  const parts: string[] = [];
  if (unlocked.length > 0) {
    return {
      id: "cve",
      status: "fail",
      summary: `Commit a lockfile beside ${unlocked.join(", ")} so resolved versions can be checked for advisories.`,
    };
  }
  if (npmChanged) {
    const npm = auditNpm(root, io);
    if (npm.status !== "pass") {
      return npm;
    }
    parts.push(npm.summary);
  }
  if (lockfiles.length > 0) {
    const osv = auditLockfiles(root, lockfiles, io);
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

interface ResolvedPackage {
  readonly ecosystem: string;
  readonly name: string;
  readonly version: string;
}

function auditLockfiles(root: string, files: readonly string[], io: ScanIo): ScanCheck {
  const packages: ResolvedPackage[] = [];
  for (const file of files) {
    const text = readText(path.join(root, file));
    if (text === null) {
      return { id: "cve", status: "unavailable", summary: `Could not read ${file}.` };
    }
    const parsed = parseLockPackages(file, text);
    if (parsed === null) {
      return {
        id: "cve",
        status: "fail",
        summary: `Could not read resolved versions from ${file}.`,
      };
    }
    packages.push(...parsed);
  }
  if (packages.length === 0) {
    return { id: "cve", status: "pass", summary: "Lockfiles contain no packages." };
  }
  const ids: string[] = [];
  for (let offset = 0; offset < packages.length; offset += 20) {
    const chunk = packages.slice(offset, offset + 20);
    const body = JSON.stringify({
      queries: chunk.map((item) => ({
        package: { name: item.name, ecosystem: item.ecosystem },
        version: item.version,
      })),
    });
    const result = io.run(
      "curl",
      [
        "-fsS",
        "--max-time",
        "20",
        "-H",
        "Content-Type: application/json",
        "-d",
        body,
        "https://api.osv.dev/v1/querybatch",
      ],
      root,
    );
    if (result.exitCode !== 0) {
      return {
        id: "cve",
        status: "unavailable",
        summary: "OSV advisory query did not return a report.",
      };
    }
    const found = readOsvIds(result.stdout);
    if (found === null) {
      return {
        id: "cve",
        status: "unavailable",
        summary: "OSV advisory query did not return a report.",
      };
    }
    for (const id of found) {
      if (!ids.includes(id)) {
        ids.push(id);
      }
    }
  }
  if (ids.length > 0) {
    return {
      id: "cve",
      status: "fail",
      summary: `OSV advisories affect resolved versions: ${ids.slice(0, 10).join(", ")}. Upgrade the package before finishing.`,
    };
  }
  return {
    id: "cve",
    status: "pass",
    summary: "OSV advisories: none for resolved lockfile versions.",
  };
}

function readText(file: string): string | null {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

function parseLockPackages(file: string, text: string): readonly ResolvedPackage[] | null {
  const base = path.posix.basename(file);
  if (base === LOCK.goSum) {
    return parseGoSum(text);
  }
  if (base === LOCK.cargo) {
    return parseTomlPackages(text, "crates.io");
  }
  if (base === LOCK.poetry || base === LOCK.uv) {
    return parseTomlPackages(text, "PyPI");
  }
  if (base === LOCK.composer) {
    return parseComposer(text);
  }
  if (base === LOCK.nuget) {
    return parseNuget(text);
  }
  if (base === LOCK.gemfile) {
    return parseGemfile(text);
  }
  return null;
}

function parseGoSum(text: string): readonly ResolvedPackage[] {
  const packages: ResolvedPackage[] = [];
  const seen = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const match = /^(\S+)\s+(v\S+?)\s+h1:/.exec(line);
    if (match?.[1] === undefined || match[2] === undefined || line.includes("/go.mod")) {
      continue;
    }
    const key = `${match[1]}@${match[2]}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    packages.push({ ecosystem: "Go", name: match[1], version: match[2] });
  }
  return packages;
}

function parseTomlPackages(text: string, ecosystem: string): readonly ResolvedPackage[] | null {
  const blocks = text.split("[[package]]");
  if (blocks.length < 2) {
    return null;
  }
  const packages: ResolvedPackage[] = [];
  for (const block of blocks.slice(1)) {
    const name = /^name\s*=\s*"([^"]+)"/m.exec(block);
    const version = /^version\s*=\s*"([^"]+)"/m.exec(block);
    if (name?.[1] === undefined || version?.[1] === undefined) {
      continue;
    }
    packages.push({ ecosystem, name: name[1], version: version[1] });
  }
  return packages;
}

function parseComposer(text: string): readonly ResolvedPackage[] | null {
  return parseNamedVersions(text, "Packagist", ["packages", "packages-dev"]);
}

function parseNuget(text: string): readonly ResolvedPackage[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return null;
  }
  if (!isRecord(parsed) || !isRecord(parsed["dependencies"])) {
    return null;
  }
  const packages: ResolvedPackage[] = [];
  for (const framework of Object.values(parsed["dependencies"])) {
    if (!isRecord(framework)) {
      continue;
    }
    for (const [name, entry] of Object.entries(framework)) {
      if (!isRecord(entry) || typeof entry["resolved"] !== "string") {
        continue;
      }
      packages.push({ ecosystem: "NuGet", name, version: entry["resolved"] });
    }
  }
  return packages;
}

function parseNamedVersions(
  text: string,
  ecosystem: string,
  keys: readonly string[],
): readonly ResolvedPackage[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return null;
  }
  if (!isRecord(parsed)) {
    return null;
  }
  const packages: ResolvedPackage[] = [];
  for (const key of keys) {
    const list = parsed[key];
    if (!Array.isArray(list)) {
      continue;
    }
    for (const entry of list) {
      if (!isRecord(entry) || typeof entry["name"] !== "string" || typeof entry["version"] !== "string") {
        continue;
      }
      packages.push({ ecosystem, name: entry["name"], version: entry["version"] });
    }
  }
  return packages;
}

function parseGemfile(text: string): readonly ResolvedPackage[] {
  const packages: ResolvedPackage[] = [];
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s{4}([A-Za-z0-9_.-]+)\s+\(([^)\s]+)\)/.exec(line);
    if (match?.[1] === undefined || match[2] === undefined) {
      continue;
    }
    packages.push({ ecosystem: "RubyGems", name: match[1], version: match[2] });
  }
  return packages;
}

export function readOsvIds(stdout: string): readonly string[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout) as unknown;
  } catch {
    return null;
  }
  if (!isRecord(parsed) || !Array.isArray(parsed["results"])) {
    return null;
  }
  const ids: string[] = [];
  for (const result of parsed["results"]) {
    if (!isRecord(result)) {
      return null;
    }
    const vulns = result["vulns"];
    if (vulns === undefined) {
      continue;
    }
    if (!Array.isArray(vulns)) {
      return null;
    }
    for (const vuln of vulns) {
      if (!isRecord(vuln) || typeof vuln["id"] !== "string" || ids.includes(vuln["id"])) {
        continue;
      }
      ids.push(vuln["id"]);
    }
  }
  return ids;
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
