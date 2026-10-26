import {
  canonicalVersion,
  compareVersionStrings,
  highestVersion,
  isStableRelease,
  normalizeRange,
  satisfies,
} from "./semver.js";

export const PACKAGE_ECOSYSTEMS = [
  "npm",
  "pypi",
  "maven",
  "cargo",
  "go",
  "node-runtime",
  "python-runtime",
  "java-runtime",
  "rust-runtime",
] as const;

export type PackageEcosystem = (typeof PACKAGE_ECOSYSTEMS)[number];

export type ResolveMode = "scaffold" | "add" | "pin" | "hold";

export type VersionChannel = "lts" | "latest" | "pin" | "installed";

export type VersionAction =
  | "use"
  | "pin"
  | "hold"
  | "needs-websearch"
  | "incompatible";

export const DEFAULT_CADENCE_DAYS = 30;
export const MAX_COMPATIBILITY_WALK = 12;

const NAME_PATTERNS: Readonly<Record<PackageEcosystem, RegExp>> = {
  npm: /^(?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+$/i,
  pypi: /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/,
  maven: /^[A-Za-z0-9_.-]+:[A-Za-z0-9_.-]+$/,
  cargo: /^[A-Za-z0-9_-]+$/,
  go: /^[A-Za-z0-9][A-Za-z0-9._~+\-/]*$/,
  "node-runtime": /^node$/,
  "python-runtime": /^python$/,
  "java-runtime": /^java$/,
  "rust-runtime": /^rust$/,
};

const LTS_DIST_TAGS = ["lts", "lts-latest", "active-lts", "maintenance-lts"];

export interface VersionRelease {
  readonly version: string;
  readonly publishedAt: string | null;
}

export interface PackageConstraints {
  readonly peers: Readonly<Record<string, string>>;
  readonly optionalPeers: readonly string[];
  readonly engines: Readonly<Record<string, string>>;
  readonly developedAgainst: Readonly<Record<string, string>>;
}

export const EMPTY_CONSTRAINTS: PackageConstraints = {
  peers: {},
  optionalPeers: [],
  engines: {},
  developedAgainst: {},
};

export interface RegistrySnapshot {
  readonly ecosystem: PackageEcosystem;
  readonly name: string;
  readonly releases: readonly VersionRelease[];
  readonly distTags: Readonly<Record<string, string>>;
  readonly ltsVersions: readonly string[];
  readonly constraintsByVersion: Readonly<Record<string, PackageConstraints>>;
  readonly supportUntil: string | null;
  readonly source: string;
}

export interface HostPackage {
  readonly ecosystem: PackageEcosystem;
  readonly name: string;
  readonly version: string;
}

export interface ReleaseChannelChoice {
  readonly latestVersion: string | null;
  readonly ltsVersion: string | null;
  readonly recommended: string | null;
  readonly channel: "lts" | "latest" | null;
  readonly ltsSupportEnded: boolean;
}

export interface ResolvePackageRequest {
  readonly ecosystem: PackageEcosystem;
  readonly name: string;
  readonly mode: ResolveMode;
  readonly requestedVersion: string | null;
  readonly hosts: readonly HostPackage[];
  readonly force: boolean;
}

export interface VersionResolution {
  readonly action: VersionAction;
  readonly ecosystem: PackageEcosystem;
  readonly name: string;
  readonly selectedVersion: string | null;
  readonly channel: VersionChannel | null;
  readonly latestVersion: string | null;
  readonly ltsVersion: string | null;
  readonly compatible: boolean | null;
  readonly cadenceDays: number | null;
  readonly supportUntil: string | null;
  readonly updatedAt: string | null;
  readonly source: string | null;
  readonly stale: boolean;
  readonly walkedBack: boolean;
  readonly reason: string;
  readonly detail: string | null;
  readonly suggestedQuery: string | null;
  readonly recordHint: string | null;
}

export function isPackageEcosystem(value: string): value is PackageEcosystem {
  return (PACKAGE_ECOSYSTEMS as readonly string[]).includes(value);
}

export function isResolveMode(value: string): value is ResolveMode {
  return (
    value === "scaffold" ||
    value === "add" ||
    value === "pin" ||
    value === "hold"
  );
}

export function isValidPackageName(
  ecosystem: PackageEcosystem,
  name: string,
): boolean {
  if (
    name.length === 0 ||
    name.startsWith("-") ||
    name.includes("..") ||
    name.includes("//") ||
    /\s/.test(name)
  ) {
    return false;
  }
  return NAME_PATTERNS[ecosystem].test(name);
}

export function normalizePackageName(name: string): string {
  return name.toLowerCase().replace(/_/g, "-");
}

export function isSupportCurrent(
  supportUntil: string | null,
  now: Date,
): boolean {
  if (supportUntil === null || supportUntil.trim().length === 0) {
    return true;
  }
  const parsed = Date.parse(supportUntil);
  if (Number.isNaN(parsed)) {
    return true;
  }
  return parsed >= now.getTime();
}

export function isCadenceExpired(
  updatedAt: string,
  cadenceDays: number,
  now: Date,
): boolean {
  const updated = Date.parse(updatedAt);
  if (Number.isNaN(updated) || cadenceDays < 1) {
    return true;
  }
  return now.getTime() - updated >= cadenceDays * 24 * 60 * 60 * 1000;
}

export function cadenceDaysFromReleases(
  releases: readonly VersionRelease[],
): number {
  const times = releases
    .filter((release) => isStableRelease(release.version))
    .map((release) => release.publishedAt)
    .filter((publishedAt): publishedAt is string => publishedAt !== null)
    .map((publishedAt) => Date.parse(publishedAt))
    .filter((timestamp) => !Number.isNaN(timestamp))
    .sort((left, right) => left - right);
  if (times.length < 2) {
    return DEFAULT_CADENCE_DAYS;
  }
  const intervals: number[] = [];
  for (let index = 1; index < times.length; index += 1) {
    const previous = times[index - 1];
    const current = times[index];
    if (previous === undefined || current === undefined) {
      continue;
    }
    const days = (current - previous) / 86_400_000;
    if (days > 0) {
      intervals.push(days);
    }
  }
  const recent = intervals.slice(-8);
  if (recent.length === 0) {
    return DEFAULT_CADENCE_DAYS;
  }
  const sorted = [...recent].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  const upper = sorted[mid];
  const lower = sorted[mid - 1];
  if (upper === undefined) {
    return DEFAULT_CADENCE_DAYS;
  }
  const median =
    sorted.length % 2 === 1 || lower === undefined ? upper : (lower + upper) / 2;
  if (!Number.isFinite(median)) {
    return DEFAULT_CADENCE_DAYS;
  }
  return Math.max(1, Math.round(median));
}

export function stableReleasesDescending(
  releases: readonly VersionRelease[],
): readonly string[] {
  const unique = new Set<string>();
  for (const release of releases) {
    if (isStableRelease(release.version)) {
      unique.add(canonicalVersion(release.version));
    }
  }
  return [...unique].sort((left, right) => compareDescending(left, right));
}

function compareDescending(left: string, right: string): number {
  return compareVersionStrings(right, left);
}

export function chooseReleaseChannel(
  releases: readonly VersionRelease[],
  distTags: Readonly<Record<string, string>>,
  ltsVersions: readonly string[],
  supportUntil: string | null,
  now: Date,
): ReleaseChannelChoice {
  const stable = stableReleasesDescending(releases);
  const taggedLatest = distTags["latest"];
  const latestVersion =
    taggedLatest !== undefined && isStableRelease(taggedLatest)
      ? canonicalVersion(taggedLatest)
      : (stable[0] ?? null);

  const taggedLts = LTS_DIST_TAGS.map((tag) => distTags[tag]).filter(
    (version): version is string =>
      version !== undefined && isStableRelease(version),
  );
  const ltsVersion = highestVersion([
    ...taggedLts.map((version) => canonicalVersion(version)),
    ...ltsVersions
      .filter((version) => isStableRelease(version))
      .map((version) => canonicalVersion(version)),
  ]);
  const ltsSupportEnded =
    ltsVersion !== null && !isSupportCurrent(supportUntil, now);
  if (ltsVersion !== null && !ltsSupportEnded) {
    return {
      latestVersion,
      ltsVersion,
      recommended: ltsVersion,
      channel: "lts",
      ltsSupportEnded,
    };
  }
  if (latestVersion !== null) {
    return {
      latestVersion,
      ltsVersion,
      recommended: latestVersion,
      channel: "latest",
      ltsSupportEnded,
    };
  }
  return {
    latestVersion,
    ltsVersion,
    recommended: null,
    channel: null,
    ltsSupportEnded,
  };
}

function engineKeyForHost(host: HostPackage): string | null {
  if (host.ecosystem === "node-runtime" || host.name === "node") {
    return "node";
  }
  if (host.ecosystem === "python-runtime" || host.name === "python") {
    return "python";
  }
  return null;
}

function lookupRange(
  table: Readonly<Record<string, string>>,
  name: string,
): string | null {
  if (Object.hasOwn(table, name)) {
    return table[name] ?? null;
  }
  const target = normalizePackageName(name);
  for (const [key, value] of Object.entries(table)) {
    if (normalizePackageName(key) === target) {
      return value;
    }
  }
  return null;
}

export function evaluateHosts(
  constraints: PackageConstraints,
  hosts: readonly HostPackage[],
): { readonly ok: boolean; readonly detail: string | null } {
  const failures: string[] = [];
  for (const host of hosts) {
    const ranges: string[] = [];
    const peer = lookupRange(constraints.peers, host.name);
    if (peer !== null) {
      ranges.push(normalizeRange(peer, "peer"));
    }
    const engineKey = engineKeyForHost(host);
    if (engineKey !== null) {
      const engineRange = constraints.engines[engineKey];
      if (engineRange !== undefined) {
        ranges.push(normalizeRange(engineRange, "peer"));
      }
    }
    if (peer === null) {
      const developed = lookupRange(constraints.developedAgainst, host.name);
      if (developed !== null) {
        ranges.push(normalizeRange(developed, "developed"));
      }
    }
    for (const range of ranges) {
      if (!satisfies(host.version, range)) {
        failures.push(`${host.name}@${host.version} outside ${range}`);
      }
    }
  }
  if (failures.length === 0) {
    return { ok: true, detail: null };
  }
  return { ok: false, detail: failures.join("; ") };
}

export interface CompatibilitySelection {
  readonly status: "selected" | "incompatible" | "unavailable";
  readonly version: string | null;
  readonly walkedBack: boolean;
  readonly detail: string | null;
  readonly constraintsByVersion: Readonly<Record<string, PackageConstraints>>;
}

export function selectCompatibleVersion(input: {
  readonly releases: readonly VersionRelease[];
  readonly recommended: string;
  readonly hosts: readonly HostPackage[];
  readonly known: Readonly<Record<string, PackageConstraints>>;
  readonly load: (version: string) => PackageConstraints | null;
}): CompatibilitySelection {
  const newest = stableReleasesDescending(input.releases).slice(
    0,
    MAX_COMPATIBILITY_WALK,
  );
  const order: string[] = [];
  for (const version of [canonicalVersion(input.recommended), ...newest]) {
    if (!order.includes(version)) {
      order.push(version);
    }
  }
  const constraintsByVersion: Record<string, PackageConstraints> = {
    ...input.known,
  };
  let lastDetail: string | null = null;
  for (const version of order) {
    let constraints = constraintsByVersion[version];
    if (constraints === undefined) {
      if (input.hosts.length === 0) {
        return {
          status: "selected",
          version,
          walkedBack: version !== canonicalVersion(input.recommended),
          detail: null,
          constraintsByVersion,
        };
      }
      const loaded = input.load(version);
      if (loaded === null) {
        return {
          status: "unavailable",
          version: null,
          walkedBack: false,
          detail: `Constraint lookup failed for ${version}.`,
          constraintsByVersion,
        };
      }
      constraints = loaded;
      constraintsByVersion[version] = loaded;
    }
    const evaluation = evaluateHosts(constraints, input.hosts);
    if (evaluation.ok) {
      return {
        status: "selected",
        version,
        walkedBack: version !== canonicalVersion(input.recommended),
        detail: evaluation.detail,
        constraintsByVersion,
      };
    }
    lastDetail = `${version}: ${evaluation.detail ?? "host constraints rejected"}`;
  }
  return {
    status: "incompatible",
    version: null,
    walkedBack: false,
    detail: lastDetail,
    constraintsByVersion,
  };
}

export function suggestedQuery(
  ecosystem: PackageEcosystem,
  name: string,
): string {
  return `${name} ${ecosystem} latest stable version, LTS version, release cadence, and support end date`;
}

export function recordHint(ecosystem: PackageEcosystem, name: string): string {
  return `npx apex-skills versions record --ecosystem ${ecosystem} --name ${name} --latest <latest> --lts <lts> --cadence-days <days> --support-until <iso-date> --source websearch`;
}
