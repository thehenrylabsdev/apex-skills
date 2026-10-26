import { execFileSync } from "node:child_process";
import { isRecord } from "./json-record.js";
import { canonicalVersion, compareVersionStrings, isStableRelease } from "./semver.js";
import {
  EMPTY_CONSTRAINTS,
  isValidPackageName,
  type PackageConstraints,
  type PackageEcosystem,
  type RegistrySnapshot,
  type VersionRelease,
} from "./version-policy.js";
import type { RegistryClient } from "./version-ledger.js";

export interface ProbeIo {
  commandExists(command: string): boolean;
  run(
    command: string,
    args: readonly string[],
    timeoutMs: number,
  ): string | null;
  fetchText(
    url: string,
    headers: Readonly<Record<string, string>>,
    timeoutMs: number,
  ): string | null;
}

const PROBE_TIMEOUT_MS = 20_000;

export function createDefaultProbeIo(): ProbeIo {
  const io: ProbeIo = {
    commandExists(command) {
      if (!/^[A-Za-z0-9.+_-]+$/.test(command)) {
        return false;
      }
      try {
        execFileSync("which", [command], { stdio: "ignore" });
        return true;
      } catch {
        return false;
      }
    },
    run(command, args, timeoutMs) {
      try {
        return execFileSync(command, [...args], {
          encoding: "utf8",
          timeout: timeoutMs,
          maxBuffer: 16 * 1024 * 1024,
          stdio: ["ignore", "pipe", "ignore"],
        });
      } catch {
        return null;
      }
    },
    fetchText(url, headers, timeoutMs) {
      if (!url.startsWith("https://") || !io.commandExists("curl")) {
        return null;
      }
      const args = [
        "-fsS",
        "--max-time",
        String(Math.max(1, Math.ceil(timeoutMs / 1000))),
        "-A",
        "apex-skills",
      ];
      for (const [key, value] of Object.entries(headers)) {
        if (/[\r\n]/.test(key) || /[\r\n]/.test(value)) {
          return null;
        }
        args.push("-H", `${key}: ${value}`);
      }
      args.push(url);
      return io.run("curl", args, timeoutMs + 2_000);
    },
  };
  return io;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function lenientStringRecord(
  value: unknown,
): Readonly<Record<string, string>> {
  if (!isRecord(value)) {
    return {};
  }
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string" && key.length > 0) {
      result[key] = entry;
    }
  }
  return result;
}

function optionalPeerNames(value: unknown): readonly string[] {
  if (!isRecord(value)) {
    return [];
  }
  const names: string[] = [];
  for (const [key, entry] of Object.entries(value)) {
    if (isRecord(entry) && entry["optional"] === true) {
      names.push(key);
    }
  }
  return names;
}

function constraintsFromFields(
  peers: unknown,
  engines: unknown,
  developed: unknown,
  optionalPeers: unknown,
): PackageConstraints {
  return {
    peers: lenientStringRecord(peers),
    engines: lenientStringRecord(engines),
    developedAgainst: lenientStringRecord(developed),
    optionalPeers: optionalPeerNames(optionalPeers),
  };
}

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function unwrapObject(value: unknown): Record<string, unknown> | null {
  if (isUnknownArray(value)) {
    const last = value[value.length - 1];
    return isRecord(last) ? last : null;
  }
  return isRecord(value) ? value : null;
}

function isSafeVersionToken(version: string): boolean {
  return /^[0-9A-Za-z][0-9A-Za-z.+_-]*$/.test(version);
}

export function parseNpmCatalog(
  text: string,
  name: string,
): RegistrySnapshot | null {
  const parsed = unwrapObject(parseJson(text));
  const versions = parsed === null ? null : parsed["versions"];
  if (parsed === null || !isUnknownArray(versions)) {
    return null;
  }
  const time = isRecord(parsed["time"]) ? parsed["time"] : {};
  const releases: VersionRelease[] = [];
  for (const entry of versions) {
    if (typeof entry !== "string") {
      continue;
    }
    const published = time[entry];
    releases.push({
      version: entry,
      publishedAt: typeof published === "string" ? published : null,
    });
  }
  if (releases.length === 0) {
    return null;
  }
  return {
    ecosystem: "npm",
    name,
    releases,
    distTags: lenientStringRecord(parsed["dist-tags"]),
    ltsVersions: [],
    constraintsByVersion: {},
    supportUntil: null,
    source: "npm",
  };
}

export function parseNpmConstraints(text: string): PackageConstraints | null {
  const parsed = unwrapObject(parseJson(text));
  if (parsed === null) {
    return null;
  }
  const dependencies = lenientStringRecord(parsed["dependencies"]);
  const devDependencies = lenientStringRecord(parsed["devDependencies"]);
  return constraintsFromFields(
    parsed["peerDependencies"],
    parsed["engines"],
    { ...devDependencies, ...dependencies },
    parsed["peerDependenciesMeta"],
  );
}

export function parseNodeIndex(text: string): RegistrySnapshot | null {
  const parsed = parseJson(text);
  if (!isUnknownArray(parsed)) {
    return null;
  }
  const releases: VersionRelease[] = [];
  const ltsVersions: string[] = [];
  for (const entry of parsed) {
    if (!isRecord(entry) || typeof entry["version"] !== "string") {
      continue;
    }
    const version = canonicalVersion(entry["version"]);
    if (!isStableRelease(version)) {
      continue;
    }
    const date = entry["date"];
    releases.push({
      version,
      publishedAt: typeof date === "string" ? date : null,
    });
    if (typeof entry["lts"] === "string" && entry["lts"].length > 0) {
      ltsVersions.push(version);
    }
  }
  if (releases.length === 0) {
    return null;
  }
  return {
    ecosystem: "node-runtime",
    name: "node",
    releases,
    distTags: {},
    ltsVersions,
    constraintsByVersion: {},
    supportUntil: null,
    source: "nodejs-index",
  };
}

export function parseMavenSearch(
  text: string,
  name: string,
): RegistrySnapshot | null {
  const parsed = unwrapObject(parseJson(text));
  const response = parsed === null ? null : parsed["response"];
  const docs = isRecord(response) ? response["docs"] : null;
  if (!isUnknownArray(docs)) {
    return null;
  }
  const releases: VersionRelease[] = [];
  for (const doc of docs) {
    if (!isRecord(doc) || typeof doc["v"] !== "string") {
      continue;
    }
    const version = canonicalVersion(doc["v"]);
    if (!isStableRelease(version)) {
      continue;
    }
    const timestamp = doc["timestamp"];
    const publishedAt =
      typeof timestamp === "number" && Number.isFinite(timestamp)
        ? new Date(timestamp).toISOString()
        : null;
    releases.push({ version, publishedAt });
  }
  if (releases.length === 0) {
    return null;
  }
  return {
    ecosystem: "maven",
    name,
    releases,
    distTags: {},
    ltsVersions: [],
    constraintsByVersion: {},
    supportUntil: null,
    source: "maven-central",
  };
}

export function parsePypi(text: string, name: string): RegistrySnapshot | null {
  const parsed = unwrapObject(parseJson(text));
  if (parsed === null) {
    return null;
  }
  const info = isRecord(parsed["info"]) ? parsed["info"] : {};
  const releasesObject = isRecord(parsed["releases"]) ? parsed["releases"] : {};
  const releases: VersionRelease[] = [];
  const constraintsByVersion: Record<string, PackageConstraints> = {};
  for (const [version, files] of Object.entries(releasesObject)) {
    if (!isUnknownArray(files) || files.length === 0) {
      continue;
    }
    const first = files[0];
    if (!isRecord(first)) {
      continue;
    }
    const yanked = files.every((file) => isRecord(file) && file["yanked"] === true);
    if (yanked) {
      continue;
    }
    const uploaded = first["upload_time_iso_8601"];
    releases.push({
      version,
      publishedAt: typeof uploaded === "string" ? uploaded : null,
    });
    const requiresPython = first["requires_python"];
    if (typeof requiresPython === "string" && requiresPython.length > 0) {
      constraintsByVersion[version] = {
        ...EMPTY_CONSTRAINTS,
        engines: { python: requiresPython },
      };
    }
  }
  if (releases.length === 0) {
    return null;
  }
  const latest = typeof info["version"] === "string" ? info["version"] : null;
  if (latest !== null) {
    const requiresDist = isUnknownArray(info["requires_dist"])
      ? info["requires_dist"]
      : [];
    const developedAgainst: Record<string, string> = {};
    for (const entry of requiresDist) {
      if (typeof entry !== "string") {
        continue;
      }
      const parsedRequirement = parsePythonRequirement(entry);
      if (parsedRequirement !== null) {
        developedAgainst[parsedRequirement.name] = parsedRequirement.range;
      }
    }
    const requiresPython =
      typeof info["requires_python"] === "string" ? info["requires_python"] : null;
    const existing = constraintsByVersion[latest] ?? EMPTY_CONSTRAINTS;
    constraintsByVersion[latest] = {
      peers: existing.peers,
      optionalPeers: existing.optionalPeers,
      engines:
        requiresPython === null
          ? existing.engines
          : { ...existing.engines, python: requiresPython },
      developedAgainst,
    };
  }
  return {
    ecosystem: "pypi",
    name,
    releases,
    distTags: latest === null ? {} : { latest },
    ltsVersions: [],
    constraintsByVersion,
    supportUntil: null,
    source: "pypi",
  };
}

function parsePythonRequirement(
  raw: string,
): { readonly name: string; readonly range: string } | null {
  const withoutMarker = raw.split(";")[0]?.trim() ?? "";
  const match = /^([A-Za-z0-9_.-]+)\s*(?:\[[^\]]*\])?\s*(.*)$/.exec(withoutMarker);
  if (match === null) {
    return null;
  }
  const name = match[1];
  const range = match[2]?.trim() ?? "";
  if (name === undefined || name.length === 0 || range.length === 0) {
    return null;
  }
  return { name, range };
}

export function parseCrates(text: string, name: string): RegistrySnapshot | null {
  const parsed = unwrapObject(parseJson(text));
  const versions = parsed === null ? null : parsed["versions"];
  if (parsed === null || !isUnknownArray(versions)) {
    return null;
  }
  const releases: VersionRelease[] = [];
  for (const entry of versions) {
    if (!isRecord(entry) || typeof entry["num"] !== "string") {
      continue;
    }
    if (entry["yanked"] === true) {
      continue;
    }
    const created = entry["created_at"];
    releases.push({
      version: entry["num"],
      publishedAt: typeof created === "string" ? created : null,
    });
  }
  if (releases.length === 0) {
    return null;
  }
  const crate = isRecord(parsed["crate"]) ? parsed["crate"] : {};
  const latest =
    typeof crate["max_stable_version"] === "string"
      ? crate["max_stable_version"]
      : null;
  return {
    ecosystem: "cargo",
    name,
    releases,
    distTags: latest === null ? {} : { latest },
    ltsVersions: [],
    constraintsByVersion: {},
    supportUntil: null,
    source: "crates",
  };
}

export function parseGoVersionList(
  text: string,
  name: string,
  source: string,
): RegistrySnapshot | null {
  const versions = text
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => /^v?\d+\.\d+\.\d+/.test(token))
    .map((token) => canonicalVersion(token.replace(/\+incompatible$/, "")));
  const unique = [...new Set(versions)];
  if (unique.length === 0) {
    return null;
  }
  return {
    ecosystem: "go",
    name,
    releases: unique.map((version) => ({ version, publishedAt: null })),
    distTags: {},
    ltsVersions: [],
    constraintsByVersion: {},
    supportUntil: null,
    source,
  };
}

export function parseRustStableChannel(text: string): RegistrySnapshot | null {
  const date = /^date\s*=\s*"(\d{4}-\d{2}-\d{2})"/m.exec(text)?.[1] ?? null;
  const version = /\[pkg\.rust\][^[]*?^version\s*=\s*"(\d+\.\d+\.\d+)/m.exec(
    text,
  )?.[1];
  if (version === undefined) {
    return null;
  }
  return {
    ecosystem: "rust-runtime",
    name: "rust",
    releases: [{ version, publishedAt: date }],
    distTags: { latest: version },
    ltsVersions: [],
    constraintsByVersion: {},
    supportUntil: null,
    source: "rust-channel",
  };
}

export function parseUvPythonList(text: string): readonly string[] {
  const versions = new Set<string>();
  for (const match of text.matchAll(/cpython-(\d+\.\d+\.\d+)/g)) {
    const version = match[1];
    if (version !== undefined) {
      versions.add(version);
    }
  }
  return [...versions];
}

export function parsePythonEol(text: string): {
  readonly releases: readonly VersionRelease[];
  readonly ltsVersions: readonly string[];
  readonly supportUntil: string | null;
} | null {
  const parsed = parseJson(text);
  if (!isUnknownArray(parsed)) {
    return null;
  }
  const releases: VersionRelease[] = [];
  const ltsVersions: string[] = [];
  let ltsSupportUntil: string | null = null;
  let highestLts: string | null = null;
  for (const entry of parsed) {
    if (!isRecord(entry) || typeof entry["latest"] !== "string") {
      continue;
    }
    const version = canonicalVersion(entry["latest"]);
    if (!isStableRelease(version)) {
      continue;
    }
    const eol = typeof entry["eol"] === "string" ? entry["eol"] : null;
    const releaseDate =
      typeof entry["releaseDate"] === "string" ? entry["releaseDate"] : null;
    releases.push({ version, publishedAt: releaseDate });
    if (entry["lts"] === true) {
      ltsVersions.push(version);
      if (highestLts === null || compareVersionStrings(version, highestLts) > 0) {
        highestLts = version;
        ltsSupportUntil = eol;
      }
    }
  }
  if (releases.length === 0) {
    return null;
  }
  return {
    releases,
    ltsVersions,
    supportUntil: ltsSupportUntil,
  };
}

export function parseAdoptiumReleases(text: string): {
  readonly ltsMajor: number;
  readonly featureMajor: number;
} | null {
  const parsed = unwrapObject(parseJson(text));
  if (parsed === null) {
    return null;
  }
  const ltsMajor = parsed["most_recent_lts"];
  const featureMajor = parsed["most_recent_feature_release"];
  if (typeof ltsMajor !== "number" || typeof featureMajor !== "number") {
    return null;
  }
  return { ltsMajor, featureMajor };
}

export function parseAdoptiumVersion(text: string): string | null {
  const parsed = parseJson(text);
  const entries = isUnknownArray(parsed) ? parsed : parsed === null ? [] : [parsed];
  for (const entry of entries) {
    if (!isRecord(entry)) {
      continue;
    }
    const version = isRecord(entry["version"]) ? entry["version"] : null;
    const openjdk =
      version !== null && typeof version["openjdk_version"] === "string"
        ? version["openjdk_version"]
        : null;
    const semver =
      version !== null && typeof version["semver"] === "string"
        ? version["semver"]
        : null;
    const candidate = openjdk ?? semver;
    if (candidate !== null) {
      const canonical = canonicalVersion(candidate);
      if (isStableRelease(canonical)) {
        return canonical;
      }
    }
  }
  return null;
}

function mavenSearchUrl(name: string): string | null {
  const separator = name.indexOf(":");
  if (separator <= 0) {
    return null;
  }
  const group = name.slice(0, separator);
  const artifact = name.slice(separator + 1);
  const query = `g:"${group}" AND a:"${artifact}" AND p:"jar"`;
  return `https://search.maven.org/solrsearch/select?q=${encodeURIComponent(query)}&rows=40&core=gav&wt=json`;
}

function encodeGoModule(name: string): string {
  return name
    .split("/")
    .map((part) => part.replace(/[A-Z]/g, (character) => `!${character.toLowerCase()}`))
    .join("/");
}

function attachNpmConstraints(
  io: ProbeIo,
  snapshot: RegistrySnapshot,
): RegistrySnapshot {
  const constraintsByVersion: Record<string, PackageConstraints> = {
    ...snapshot.constraintsByVersion,
  };
  const interesting = new Set<string>();
  const latest = snapshot.distTags["latest"];
  if (latest !== undefined) {
    interesting.add(latest);
  }
  for (const version of snapshot.ltsVersions) {
    interesting.add(version);
  }
  for (const version of interesting) {
    const constraints = fetchNpmConstraints(io, snapshot.name, version);
    if (constraints !== null) {
      constraintsByVersion[version] = constraints;
    }
  }
  return { ...snapshot, constraintsByVersion };
}

function fetchNpmConstraints(
  io: ProbeIo,
  name: string,
  version: string,
): PackageConstraints | null {
  if (!isSafeVersionToken(version) || !io.commandExists("npm")) {
    return null;
  }
  const text = io.run(
    "npm",
    [
      "view",
      `${name}@${version}`,
      "peerDependencies",
      "engines",
      "devDependencies",
      "dependencies",
      "peerDependenciesMeta",
      "--json",
    ],
    PROBE_TIMEOUT_MS,
  );
  if (text === null) {
    return null;
  }
  return parseNpmConstraints(text);
}

function fetchNpm(io: ProbeIo, name: string): RegistrySnapshot | null {
  if (!io.commandExists("npm")) {
    return null;
  }
  const text = io.run(
    "npm",
    ["view", name, "versions", "time", "dist-tags", "--json"],
    PROBE_TIMEOUT_MS,
  );
  if (text === null) {
    return null;
  }
  const snapshot = parseNpmCatalog(text, name);
  if (snapshot === null) {
    return null;
  }
  return attachNpmConstraints(io, snapshot);
}

function fetchPypi(io: ProbeIo, name: string): RegistrySnapshot | null {
  const text = io.fetchText(
    `https://pypi.org/pypi/${encodeURIComponent(name)}/json`,
    { Accept: "application/json" },
    PROBE_TIMEOUT_MS,
  );
  if (text === null) {
    return null;
  }
  return parsePypi(text, name);
}

function fetchMaven(io: ProbeIo, name: string): RegistrySnapshot | null {
  const url = mavenSearchUrl(name);
  if (url === null) {
    return null;
  }
  const text = io.fetchText(url, { Accept: "application/json" }, PROBE_TIMEOUT_MS);
  if (text === null) {
    return null;
  }
  return parseMavenSearch(text, name);
}

function fetchCargo(io: ProbeIo, name: string): RegistrySnapshot | null {
  const text = io.fetchText(
    `https://crates.io/api/v1/crates/${encodeURIComponent(name)}`,
    { Accept: "application/json" },
    PROBE_TIMEOUT_MS,
  );
  if (text === null) {
    return null;
  }
  return parseCrates(text, name);
}

function fetchGo(io: ProbeIo, name: string): RegistrySnapshot | null {
  if (io.commandExists("go")) {
    const listed = io.run(
      "go",
      ["list", "-m", "-versions", name],
      PROBE_TIMEOUT_MS,
    );
    if (listed !== null) {
      const snapshot = parseGoVersionList(listed, name, "go-list");
      if (snapshot !== null) {
        return snapshot;
      }
    }
  }
  const proxied = io.fetchText(
    `https://proxy.golang.org/${encodeGoModule(name)}/@v/list`,
    { Accept: "text/plain" },
    PROBE_TIMEOUT_MS,
  );
  if (proxied === null) {
    return null;
  }
  return parseGoVersionList(proxied, name, "go-proxy");
}

function fetchNodeRuntime(io: ProbeIo): RegistrySnapshot | null {
  const text = io.fetchText(
    "https://nodejs.org/dist/index.json",
    { Accept: "application/json" },
    PROBE_TIMEOUT_MS,
  );
  if (text === null) {
    return null;
  }
  return parseNodeIndex(text);
}

function fetchRustRuntime(io: ProbeIo): RegistrySnapshot | null {
  const text = io.fetchText(
    "https://static.rust-lang.org/dist/channel-rust-stable.toml",
    { Accept: "text/plain" },
    PROBE_TIMEOUT_MS,
  );
  if (text === null) {
    return null;
  }
  return parseRustStableChannel(text);
}

function fetchJavaRuntime(io: ProbeIo): RegistrySnapshot | null {
  const catalog = io.fetchText(
    "https://api.adoptium.net/v3/info/available_releases",
    { Accept: "application/json" },
    PROBE_TIMEOUT_MS,
  );
  if (catalog === null) {
    return null;
  }
  const majors = parseAdoptiumReleases(catalog);
  if (majors === null) {
    return null;
  }
  const majorsToFetch = [...new Set([majors.ltsMajor, majors.featureMajor])];
  const releases: VersionRelease[] = [];
  const ltsVersions: string[] = [];
  for (const major of majorsToFetch) {
    const body = io.fetchText(
      `https://api.adoptium.net/v3/assets/latest/${major}/hotspot`,
      { Accept: "application/json" },
      PROBE_TIMEOUT_MS,
    );
    if (body === null) {
      continue;
    }
    const version = parseAdoptiumVersion(body);
    if (version === null) {
      continue;
    }
    releases.push({ version, publishedAt: null });
    if (major === majors.ltsMajor) {
      ltsVersions.push(version);
    }
  }
  if (releases.length === 0) {
    return null;
  }
  return {
    ecosystem: "java-runtime",
    name: "java",
    releases,
    distTags: {},
    ltsVersions,
    constraintsByVersion: {},
    supportUntil: null,
    source: "adoptium",
  };
}

function fetchPythonRuntime(io: ProbeIo): RegistrySnapshot | null {
  const uvVersions = io.commandExists("uv")
    ? parseUvPythonList(io.run("uv", ["python", "list"], PROBE_TIMEOUT_MS) ?? "")
    : [];
  const eolText = io.fetchText(
    "https://endoflife.date/api/python.json",
    { Accept: "application/json" },
    PROBE_TIMEOUT_MS,
  );
  const eol = eolText === null ? null : parsePythonEol(eolText);
  if (eol !== null) {
    const merged = new Map<string, VersionRelease>();
    for (const release of eol.releases) {
      merged.set(release.version, release);
    }
    for (const version of uvVersions) {
      if (!merged.has(version)) {
        merged.set(version, { version, publishedAt: null });
      }
    }
    return {
      ecosystem: "python-runtime",
      name: "python",
      releases: [...merged.values()],
      distTags: {},
      ltsVersions: eol.ltsVersions,
      constraintsByVersion: {},
      supportUntil: eol.supportUntil,
      source: uvVersions.length > 0 ? "uv+endoflife-python" : "endoflife-python",
    };
  }
  if (uvVersions.length === 0) {
    return null;
  }
  return {
    ecosystem: "python-runtime",
    name: "python",
    releases: uvVersions.map((version) => ({ version, publishedAt: null })),
    distTags: {},
    ltsVersions: [],
    constraintsByVersion: {},
    supportUntil: null,
    source: "uv",
  };
}

export function createRegistryClient(io: ProbeIo): RegistryClient {
  return {
    fetchSnapshot(
      ecosystem: PackageEcosystem,
      name: string,
    ): RegistrySnapshot | null {
      if (!isValidPackageName(ecosystem, name)) {
        return null;
      }
      switch (ecosystem) {
        case "npm":
          return fetchNpm(io, name);
        case "pypi":
          return fetchPypi(io, name);
        case "maven":
          return fetchMaven(io, name);
        case "cargo":
          return fetchCargo(io, name);
        case "go":
          return fetchGo(io, name);
        case "node-runtime":
          return fetchNodeRuntime(io);
        case "python-runtime":
          return fetchPythonRuntime(io);
        case "java-runtime":
          return fetchJavaRuntime(io);
        case "rust-runtime":
          return fetchRustRuntime(io);
      }
    },
    fetchConstraints(
      ecosystem: PackageEcosystem,
      name: string,
      version: string,
    ): PackageConstraints | null {
      if (!isValidPackageName(ecosystem, name)) {
        return null;
      }
      if (ecosystem === "npm") {
        return fetchNpmConstraints(io, name, version);
      }
      if (ecosystem === "pypi") {
        const text = io.fetchText(
          `https://pypi.org/pypi/${encodeURIComponent(name)}/${encodeURIComponent(version)}/json`,
          { Accept: "application/json" },
          PROBE_TIMEOUT_MS,
        );
        if (text === null) {
          return null;
        }
        const snapshot = parsePypi(text, name);
        if (snapshot === null) {
          return null;
        }
        return snapshot.constraintsByVersion[version] ?? { ...EMPTY_CONSTRAINTS };
      }
      return { ...EMPTY_CONSTRAINTS };
    },
  };
}
