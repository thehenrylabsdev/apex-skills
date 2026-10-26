import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { DatabaseSync, type SQLOutputValue } from "node:sqlite";
import { readSqlNumber, readSqlString } from "./sql-cells.js";
import {
  EMPTY_CONSTRAINTS,
  cadenceDaysFromReleases,
  chooseReleaseChannel,
  evaluateHosts,
  isCadenceExpired,
  isValidPackageName,
  recordHint,
  selectCompatibleVersion,
  suggestedQuery,
  type PackageConstraints,
  type PackageEcosystem,
  type RegistrySnapshot,
  type ResolvePackageRequest,
  type VersionRelease,
  type VersionResolution,
} from "./version-policy.js";

export interface StoredReleaseRecord {
  readonly ecosystem: PackageEcosystem;
  readonly name: string;
  readonly latestVersion: string | null;
  readonly ltsVersion: string | null;
  readonly cadenceDays: number;
  readonly supportUntil: string | null;
  readonly updatedAt: string;
  readonly source: string;
  readonly releases: readonly VersionRelease[];
  readonly distTags: Readonly<Record<string, string>>;
  readonly ltsVersions: readonly string[];
  readonly constraintsByVersion: Readonly<Record<string, PackageConstraints>>;
}

export interface RegistryClient {
  fetchSnapshot(
    ecosystem: PackageEcosystem,
    name: string,
  ): RegistrySnapshot | null;
  fetchConstraints(
    ecosystem: PackageEcosystem,
    name: string,
    version: string,
  ): PackageConstraints | null;
}

export interface VersionLedger {
  read(ecosystem: PackageEcosystem, name: string): StoredReleaseRecord | null;
  write(record: StoredReleaseRecord): void;
  close(): void;
}

const CREATE_TABLE = `
CREATE TABLE IF NOT EXISTS release_records (
  ecosystem TEXT NOT NULL,
  name TEXT NOT NULL,
  latest_version TEXT,
  lts_version TEXT,
  cadence_days INTEGER NOT NULL,
  support_until TEXT,
  updated_at TEXT NOT NULL,
  source TEXT NOT NULL,
  releases_json TEXT NOT NULL,
  dist_tags_json TEXT NOT NULL,
  lts_versions_json TEXT NOT NULL,
  constraints_json TEXT NOT NULL,
  PRIMARY KEY (ecosystem, name)
)`;

export function defaultLedgerPath(): string {
  return path.join(homedir(), ".apex", "version-ledger.sqlite");
}

export function openVersionLedger(dbPath: string): VersionLedger {
  if (dbPath !== ":memory:") {
    mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  db.exec(CREATE_TABLE);
  return {
    read(ecosystem, name): StoredReleaseRecord | null {
      const row = db
        .prepare(
          `SELECT ecosystem, name, latest_version, lts_version, cadence_days,
                  support_until, updated_at, source, releases_json, dist_tags_json,
                  lts_versions_json, constraints_json
           FROM release_records WHERE ecosystem = ? AND name = ?`,
        )
        .get(ecosystem, name);
      if (row === undefined) {
        return null;
      }
      return parseStoredRow(row);
    },
    write(record): void {
      db.prepare(
        `INSERT INTO release_records (
           ecosystem, name, latest_version, lts_version, cadence_days, support_until,
           updated_at, source, releases_json, dist_tags_json, lts_versions_json,
           constraints_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(ecosystem, name) DO UPDATE SET
           latest_version = excluded.latest_version,
           lts_version = excluded.lts_version,
           cadence_days = excluded.cadence_days,
           support_until = excluded.support_until,
           updated_at = excluded.updated_at,
           source = excluded.source,
           releases_json = excluded.releases_json,
           dist_tags_json = excluded.dist_tags_json,
           lts_versions_json = excluded.lts_versions_json,
           constraints_json = excluded.constraints_json`,
      ).run(
        record.ecosystem,
        record.name,
        record.latestVersion,
        record.ltsVersion,
        record.cadenceDays,
        record.supportUntil,
        record.updatedAt,
        record.source,
        JSON.stringify(record.releases),
        JSON.stringify(record.distTags),
        JSON.stringify(record.ltsVersions),
        JSON.stringify(record.constraintsByVersion),
      );
    },
    close(): void {
      db.close();
    },
  };
}

function cellString(value: SQLOutputValue | undefined): string | null {
  return readSqlString(value);
}

function cellNumber(value: SQLOutputValue | undefined): number | null {
  return readSqlNumber(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStringRecord(value: unknown): Readonly<Record<string, string>> | null {
  if (!isRecord(value)) {
    return null;
  }
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== "string") {
      return null;
    }
    result[key] = entry;
  }
  return result;
}

function readStringArray(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    return null;
  }
  return value;
}

function readReleases(value: unknown): readonly VersionRelease[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const releases: VersionRelease[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry["version"] !== "string") {
      return null;
    }
    const publishedAt = entry["publishedAt"];
    if (publishedAt !== null && typeof publishedAt !== "string") {
      return null;
    }
    releases.push({
      version: entry["version"],
      publishedAt,
    });
  }
  return releases;
}

function readConstraintsMap(
  value: unknown,
): Readonly<Record<string, PackageConstraints>> | null {
  if (!isRecord(value)) {
    return null;
  }
  const result: Record<string, PackageConstraints> = {};
  for (const [version, entry] of Object.entries(value)) {
    const constraints = readConstraints(entry);
    if (constraints === null) {
      return null;
    }
    result[version] = constraints;
  }
  return result;
}

export function readConstraints(value: unknown): PackageConstraints | null {
  if (!isRecord(value)) {
    return null;
  }
  const peers = readStringRecord(value["peers"] ?? {});
  const engines = readStringRecord(value["engines"] ?? {});
  const developedAgainst = readStringRecord(value["developedAgainst"] ?? {});
  const optionalPeers = readStringArray(value["optionalPeers"] ?? []);
  if (
    peers === null ||
    engines === null ||
    developedAgainst === null ||
    optionalPeers === null
  ) {
    return null;
  }
  return { peers, engines, developedAgainst, optionalPeers };
}

function parseStoredRow(
  row: Record<string, SQLOutputValue>,
): StoredReleaseRecord | null {
  const ecosystem = cellString(row["ecosystem"]);
  const name = cellString(row["name"]);
  const cadenceDays = cellNumber(row["cadence_days"]);
  const updatedAt = cellString(row["updated_at"]);
  const source = cellString(row["source"]);
  if (
    ecosystem === null ||
    name === null ||
    cadenceDays === null ||
    updatedAt === null ||
    source === null ||
    !isKnownEcosystem(ecosystem)
  ) {
    return null;
  }
  try {
    const releases = readReleases(JSON.parse(cellString(row["releases_json"]) ?? ""));
    const distTags = readStringRecord(
      JSON.parse(cellString(row["dist_tags_json"]) ?? ""),
    );
    const ltsVersions = readStringArray(
      JSON.parse(cellString(row["lts_versions_json"]) ?? ""),
    );
    const constraintsByVersion = readConstraintsMap(
      JSON.parse(cellString(row["constraints_json"]) ?? ""),
    );
    if (
      releases === null ||
      distTags === null ||
      ltsVersions === null ||
      constraintsByVersion === null
    ) {
      return null;
    }
    return {
      ecosystem,
      name,
      latestVersion: cellString(row["latest_version"]),
      ltsVersion: cellString(row["lts_version"]),
      cadenceDays,
      supportUntil: cellString(row["support_until"]),
      updatedAt,
      source,
      releases,
      distTags,
      ltsVersions,
      constraintsByVersion,
    };
  } catch {
    return null;
  }
}

function isKnownEcosystem(value: string): value is PackageEcosystem {
  return (
    value === "npm" ||
    value === "pypi" ||
    value === "maven" ||
    value === "cargo" ||
    value === "go" ||
    value === "node-runtime" ||
    value === "python-runtime" ||
    value === "java-runtime" ||
    value === "rust-runtime"
  );
}

export function snapshotFromRecord(record: StoredReleaseRecord): RegistrySnapshot {
  return {
    ecosystem: record.ecosystem,
    name: record.name,
    releases: record.releases,
    distTags: record.distTags,
    ltsVersions: record.ltsVersions,
    constraintsByVersion: record.constraintsByVersion,
    supportUntil: record.supportUntil,
    source: record.source,
  };
}

export function recordFromSnapshot(
  snapshot: RegistrySnapshot,
  now: Date,
  cadenceDays?: number,
): StoredReleaseRecord {
  const choice = chooseReleaseChannel(
    snapshot.releases,
    snapshot.distTags,
    snapshot.ltsVersions,
    snapshot.supportUntil,
    now,
  );
  return {
    ecosystem: snapshot.ecosystem,
    name: snapshot.name,
    latestVersion: choice.latestVersion,
    ltsVersion: choice.ltsVersion,
    cadenceDays: cadenceDays ?? cadenceDaysFromReleases(snapshot.releases),
    supportUntil: snapshot.supportUntil,
    updatedAt: now.toISOString(),
    source: snapshot.source,
    releases: snapshot.releases,
    distTags: snapshot.distTags,
    ltsVersions: snapshot.ltsVersions,
    constraintsByVersion: snapshot.constraintsByVersion,
  };
}

function resolutionBase(
  request: ResolvePackageRequest,
  overrides: Partial<VersionResolution>,
): VersionResolution {
  return {
    action: "needs-websearch",
    ecosystem: request.ecosystem,
    name: request.name,
    selectedVersion: null,
    channel: null,
    latestVersion: null,
    ltsVersion: null,
    compatible: null,
    cadenceDays: null,
    supportUntil: null,
    updatedAt: null,
    source: null,
    stale: false,
    walkedBack: false,
    reason: "registry-unavailable",
    detail: null,
    suggestedQuery: null,
    recordHint: null,
    ...overrides,
  };
}

function needsWebSearch(
  request: ResolvePackageRequest,
  reason: string,
  stale: boolean,
  cached: StoredReleaseRecord | null,
  detail: string | null,
): VersionResolution {
  return resolutionBase(request, {
    action: "needs-websearch",
    latestVersion: cached?.latestVersion ?? null,
    ltsVersion: cached?.ltsVersion ?? null,
    cadenceDays: cached?.cadenceDays ?? null,
    supportUntil: cached?.supportUntil ?? null,
    updatedAt: cached?.updatedAt ?? null,
    source: cached?.source ?? null,
    stale,
    reason,
    detail,
    suggestedQuery: suggestedQuery(request.ecosystem, request.name),
    recordHint: recordHint(request.ecosystem, request.name),
  });
}

export function resolvePackageVersion(
  ledger: VersionLedger,
  client: RegistryClient,
  request: ResolvePackageRequest,
  now: Date,
): VersionResolution {
  if (!isValidPackageName(request.ecosystem, request.name)) {
    return resolutionBase(request, {
      reason: "invalid-package-name",
      detail: "Package name rejected before any registry lookup.",
    });
  }

  if (request.mode === "pin" && request.requestedVersion === null) {
    return resolutionBase(request, {
      action: "pin",
      reason: "missing-pinned-version",
      detail: "An explicit version pin needs the version the user named.",
    });
  }

  if (request.requestedVersion !== null && request.mode !== "hold") {
    return resolvePin(ledger, request, now);
  }

  if (request.mode === "hold") {
    if (request.requestedVersion === null) {
      return resolutionBase(request, {
        action: "hold",
        reason: "missing-installed-version",
        detail: "Manifest Hold requires the installed version.",
      });
    }
    return resolutionBase(request, {
      action: "hold",
      selectedVersion: request.requestedVersion,
      channel: "installed",
      reason: "manifest-hold",
    });
  }

  const cached = ledger.read(request.ecosystem, request.name);
  const fresh =
    cached !== null &&
    !request.force &&
    !isCadenceExpired(cached.updatedAt, cached.cadenceDays, now);

  let snapshot: RegistrySnapshot | null;
  if (fresh) {
    snapshot = snapshotFromRecord(cached);
  } else {
    snapshot = client.fetchSnapshot(request.ecosystem, request.name);
    if (snapshot === null) {
      return needsWebSearch(
        request,
        cached === null
          ? "registry-unavailable"
          : "cadence-expired-registry-unavailable",
        cached !== null,
        cached,
        null,
      );
    }
    const previousConstraints = cached?.constraintsByVersion ?? {};
    const merged: RegistrySnapshot = {
      ...snapshot,
      constraintsByVersion: {
        ...previousConstraints,
        ...snapshot.constraintsByVersion,
      },
    };
    ledger.write(recordFromSnapshot(merged, now));
    snapshot = merged;
  }

  const stored = ledger.read(request.ecosystem, request.name);
  const choice = chooseReleaseChannel(
    snapshot.releases,
    snapshot.distTags,
    snapshot.ltsVersions,
    snapshot.supportUntil,
    now,
  );
  if (choice.recommended === null || choice.channel === null) {
    return needsWebSearch(
      request,
      "registry-returned-no-version",
      false,
      stored,
      "Registry metadata contained no stable release.",
    );
  }

  const selection = selectCompatibleVersion({
    releases: snapshot.releases,
    recommended: choice.recommended,
    hosts: request.hosts,
    known: snapshot.constraintsByVersion,
    load(version) {
      return client.fetchConstraints(request.ecosystem, request.name, version);
    },
  });

  if (stored !== null) {
    ledger.write({
      ...stored,
      constraintsByVersion: selection.constraintsByVersion,
    });
  }

  if (selection.status === "unavailable") {
    return needsWebSearch(
      request,
      "constraint-lookup-failed",
      false,
      ledger.read(request.ecosystem, request.name),
      selection.detail,
    );
  }

  if (selection.status === "incompatible" || selection.version === null) {
    return resolutionBase(request, {
      action: "incompatible",
      latestVersion: choice.latestVersion,
      ltsVersion: choice.ltsVersion,
      compatible: false,
      cadenceDays: stored?.cadenceDays ?? null,
      supportUntil: snapshot.supportUntil,
      updatedAt: stored?.updatedAt ?? null,
      source: snapshot.source,
      reason: "no-compatible-release",
      detail: selection.detail,
    });
  }

  const channel = selection.version === choice.ltsVersion ? "lts" : "latest";
  let reason = request.hosts.length === 0 ? "release-channel" : "host-compatible";
  if (selection.walkedBack) {
    reason = "walked-back-for-host-compatibility";
  } else if (choice.ltsSupportEnded && channel === "latest") {
    reason = "lts-support-ended";
  }
  return resolutionBase(request, {
    action: "use",
    selectedVersion: selection.version,
    channel,
    latestVersion: choice.latestVersion,
    ltsVersion: choice.ltsVersion,
    compatible: true,
    cadenceDays: stored?.cadenceDays ?? null,
    supportUntil: snapshot.supportUntil,
    updatedAt: stored?.updatedAt ?? null,
    source: snapshot.source,
    walkedBack: selection.walkedBack,
    reason,
    detail: selection.detail,
    suggestedQuery: null,
    recordHint: null,
  });
}

function resolvePin(
  ledger: VersionLedger,
  request: ResolvePackageRequest,
  now: Date,
): VersionResolution {
  const pinned = request.requestedVersion;
  if (pinned === null) {
    return resolutionBase(request, {
      action: "pin",
      reason: "missing-pinned-version",
    });
  }
  const cached = ledger.read(request.ecosystem, request.name);
  let compatible: boolean | null = null;
  let detail: string | null = null;
  if (cached !== null && request.hosts.length > 0) {
    const constraints = cached.constraintsByVersion[pinned] ?? EMPTY_CONSTRAINTS;
    const known = Object.hasOwn(cached.constraintsByVersion, pinned);
    if (known) {
      const evaluation = evaluateHosts(constraints, request.hosts);
      compatible = evaluation.ok;
      detail = evaluation.ok
        ? null
        : `Pinned version kept. ${evaluation.detail ?? "Host constraints reject it."}`;
    }
  }
  return resolutionBase(request, {
    action: "pin",
    selectedVersion: pinned,
    channel: "pin",
    latestVersion: cached?.latestVersion ?? null,
    ltsVersion: cached?.ltsVersion ?? null,
    compatible,
    cadenceDays: cached?.cadenceDays ?? null,
    supportUntil: cached?.supportUntil ?? null,
    updatedAt: cached?.updatedAt ?? null,
    source: cached?.source ?? null,
    stale:
      cached !== null &&
      isCadenceExpired(cached.updatedAt, cached.cadenceDays, now),
    reason: "explicit-version-pin",
    detail,
  });
}

export function recordResolvedRelease(
  ledger: VersionLedger,
  snapshot: RegistrySnapshot,
  now: Date,
  cadenceDays: number,
): StoredReleaseRecord {
  const record = recordFromSnapshot(snapshot, now, cadenceDays);
  ledger.write(record);
  return record;
}
