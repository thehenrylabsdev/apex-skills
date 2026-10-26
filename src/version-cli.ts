import { isRecord } from "./json-record.js";
import { createRegistryClient, createDefaultProbeIo } from "./version-probes.js";
import {
  defaultLedgerPath,
  openVersionLedger,
  readConstraints,
  recordResolvedRelease,
  resolvePackageVersion,
  type RegistryClient,
  type VersionLedger,
} from "./version-ledger.js";
import {
  isPackageEcosystem,
  isResolveMode,
  isValidPackageName,
  type HostPackage,
  type PackageConstraints,
  type PackageEcosystem,
  type RegistrySnapshot,
  type ResolveMode,
  type VersionResolution,
} from "./version-policy.js";

export interface VersionCommandOptions {
  readonly client?: RegistryClient;
  readonly now?: Date;
  readonly ledgerPath?: string;
  readonly stdout?: (chunk: string) => void;
  readonly stderr?: (chunk: string) => void;
}

export interface RecordedRelease {
  readonly action: "recorded";
  readonly ecosystem: PackageEcosystem;
  readonly name: string;
  readonly latestVersion: string | null;
  readonly ltsVersion: string | null;
  readonly cadenceDays: number;
  readonly supportUntil: string | null;
  readonly updatedAt: string;
  readonly source: string;
}

const USAGE = `apex-skills versions resolve --ecosystem <ecosystem> --name <name> --mode <scaffold|add|pin|hold> [--version <version>] [--host <ecosystem:name@version>] [--db <path>] [--force]
apex-skills versions record --ecosystem <ecosystem> --name <name> --latest <version> [--lts <version>] [--cadence-days <days>] [--support-until <iso>] [--versions <a,b>] [--constraints-json <json>] [--source <source>] [--db <path>]
`;

function writeOut(options: VersionCommandOptions, chunk: string): void {
  const stdout =
    options.stdout ??
    ((value: string): void => {
      process.stdout.write(value);
    });
  stdout(chunk);
}

function writeErr(options: VersionCommandOptions, chunk: string): void {
  const stderr =
    options.stderr ??
    ((value: string): void => {
      process.stderr.write(value);
    });
  stderr(chunk);
}

export function parseHostToken(
  token: string,
  fallbackEcosystem: PackageEcosystem,
): HostPackage | null {
  const at = token.lastIndexOf("@");
  if (at <= 0 || at === token.length - 1) {
    return null;
  }
  const version = token.slice(at + 1);
  const left = token.slice(0, at);
  if (version.length === 0 || version.startsWith("-") || /\s/.test(version)) {
    return null;
  }
  let ecosystem = fallbackEcosystem;
  let name = left;
  const colon = left.indexOf(":");
  if (colon > 0) {
    const prefix = left.slice(0, colon);
    if (isPackageEcosystem(prefix)) {
      ecosystem = prefix;
      name = left.slice(colon + 1);
    }
  }
  if (!isValidPackageName(ecosystem, name)) {
    return null;
  }
  return { ecosystem, name, version };
}

function parseConstraintsFlag(
  text: string,
): Readonly<Record<string, PackageConstraints>> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return null;
  }
  if (!isRecord(parsed)) {
    return null;
  }
  const result: Record<string, PackageConstraints> = {};
  for (const [version, entry] of Object.entries(parsed)) {
    const constraints = readConstraints(entry);
    if (constraints === null || version.length === 0) {
      return null;
    }
    result[version] = constraints;
  }
  return result;
}

interface ParsedFlags {
  readonly positional: readonly string[];
  readonly values: ReadonlyMap<string, readonly string[]>;
  readonly force: boolean;
}

function parseFlags(args: readonly string[]): ParsedFlags | null {
  const positional: string[] = [];
  const values = new Map<string, string[]>();
  let force = false;
  const valued = new Set([
    "--ecosystem",
    "--name",
    "--mode",
    "--version",
    "--host",
    "--db",
    "--latest",
    "--lts",
    "--cadence-days",
    "--support-until",
    "--versions",
    "--constraints-json",
    "--source",
  ]);
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === undefined) {
      continue;
    }
    if (token === "--force") {
      force = true;
      continue;
    }
    if (token === "--json" || token === "--help" || token === "-h") {
      if (token !== "--json") {
        positional.push(token);
      }
      continue;
    }
    if (token.startsWith("--")) {
      if (!valued.has(token)) {
        return null;
      }
      const next = args[index + 1];
      if (next === undefined || next.startsWith("--")) {
        return null;
      }
      const existing = values.get(token) ?? [];
      existing.push(next);
      values.set(token, existing);
      index += 1;
      continue;
    }
    positional.push(token);
  }
  return { positional, values, force };
}

function single(
  flags: ParsedFlags,
  name: string,
): string | null {
  const values = flags.values.get(name);
  if (values?.length !== 1) {
    return null;
  }
  return values[0] ?? null;
}

function optionalSingle(flags: ParsedFlags, name: string): string | null {
  const values = flags.values.get(name);
  if (values === undefined || values.length === 0) {
    return null;
  }
  if (values.length !== 1) {
    return null;
  }
  return values[0] ?? null;
}

export function executeVersionCommand(
  args: readonly string[],
  options: VersionCommandOptions = {},
): number {
  try {
    return runVersionCommand(args, options);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "version command failed";
    writeErr(options, `${message}\n`);
    return 1;
  }
}

function runVersionCommand(
  args: readonly string[],
  options: VersionCommandOptions,
): number {
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    writeOut(options, USAGE);
    return args.length === 0 ? 2 : 0;
  }
  const flags = parseFlags(args);
  if (flags === null) {
    writeErr(options, `Unrecognized or incomplete arguments.\n${USAGE}`);
    return 2;
  }
  const command = flags.positional[0];
  if (command !== "resolve" && command !== "record") {
    writeErr(options, `Unknown versions command.\n${USAGE}`);
    return 2;
  }
  const ecosystemText = single(flags, "--ecosystem");
  const name = single(flags, "--name");
  if (ecosystemText === null || name === null || !isPackageEcosystem(ecosystemText)) {
    writeErr(options, `Missing --ecosystem or --name.\n${USAGE}`);
    return 2;
  }
  if (!isValidPackageName(ecosystemText, name)) {
    writeErr(options, `Invalid package name for ${ecosystemText}.\n`);
    return 2;
  }
  const ledgerPath =
    options.ledgerPath ?? optionalSingle(flags, "--db") ?? defaultLedgerPath();
  const now = options.now ?? new Date();
  const ledger = openVersionLedger(ledgerPath);
  try {
    if (command === "record") {
      return recordCommand(flags, ecosystemText, name, ledger, now, options);
    }
    return resolveCommand(
      flags,
      ecosystemText,
      name,
      ledger,
      now,
      options,
    );
  } finally {
    ledger.close();
  }
}

function resolveCommand(
  flags: ParsedFlags,
  ecosystem: PackageEcosystem,
  name: string,
  ledger: VersionLedger,
  now: Date,
  options: VersionCommandOptions,
): number {
  const modeText = single(flags, "--mode");
  if (modeText === null || !isResolveMode(modeText)) {
    writeErr(options, `Missing --mode scaffold|add|pin|hold.\n`);
    return 2;
  }
  const mode: ResolveMode = modeText;
  const requestedVersion = optionalSingle(flags, "--version");
  const hosts: HostPackage[] = [];
  for (const token of flags.values.get("--host") ?? []) {
    const host = parseHostToken(token, ecosystem);
    if (host === null) {
      writeErr(options, `Invalid --host ${token}.\n`);
      return 2;
    }
    hosts.push(host);
  }
  const client = options.client ?? createRegistryClient(createDefaultProbeIo());
  const resolution: VersionResolution = resolvePackageVersion(
    ledger,
    client,
    {
      ecosystem,
      name,
      mode,
      requestedVersion,
      hosts,
      force: flags.force,
    },
    now,
  );
  writeOut(options, `${JSON.stringify(resolution, null, 2)}\n`);
  return 0;
}

function recordCommand(
  flags: ParsedFlags,
  ecosystem: PackageEcosystem,
  name: string,
  ledger: VersionLedger,
  now: Date,
  options: VersionCommandOptions,
): number {
  const latest = single(flags, "--latest");
  if (latest === null || latest.startsWith("-")) {
    writeErr(options, `Missing --latest.\n`);
    return 2;
  }
  const lts = optionalSingle(flags, "--lts");
  const cadenceText = optionalSingle(flags, "--cadence-days");
  const cadenceDays = cadenceText === null ? 30 : Number(cadenceText);
  if (!Number.isInteger(cadenceDays) || cadenceDays < 1 || cadenceDays > 3660) {
    writeErr(options, `--cadence-days must be an integer from 1 to 3660.\n`);
    return 2;
  }
  const supportUntil = optionalSingle(flags, "--support-until");
  if (supportUntil !== null && Number.isNaN(Date.parse(supportUntil))) {
    writeErr(options, `--support-until must be an ISO date.\n`);
    return 2;
  }
  const source = optionalSingle(flags, "--source") ?? "websearch";
  if (!/^[a-z0-9._+-]{1,40}$/.test(source)) {
    writeErr(options, `Invalid --source.\n`);
    return 2;
  }
  const extra = (optionalSingle(flags, "--versions") ?? "")
    .split(",")
    .map((version) => version.trim())
    .filter((version) => version.length > 0);
  const versions = [...new Set([latest, ...(lts === null ? [] : [lts]), ...extra])];
  const constraintsText = optionalSingle(flags, "--constraints-json");
  const constraintsByVersion =
    constraintsText === null ? {} : parseConstraintsFlag(constraintsText);
  if (constraintsByVersion === null) {
    writeErr(options, `--constraints-json must be an object of version constraints.\n`);
    return 2;
  }
  const snapshot: RegistrySnapshot = {
    ecosystem,
    name,
    releases: versions.map((version) => ({ version, publishedAt: null })),
    distTags: lts === null ? { latest } : { latest, lts },
    ltsVersions: lts === null ? [] : [lts],
    constraintsByVersion,
    supportUntil,
    source,
  };
  const recorded = recordResolvedRelease(ledger, snapshot, now, cadenceDays);
  const body: RecordedRelease = {
    action: "recorded",
    ecosystem,
    name,
    latestVersion: recorded.latestVersion,
    ltsVersion: recorded.ltsVersion,
    cadenceDays: recorded.cadenceDays,
    supportUntil: recorded.supportUntil,
    updatedAt: recorded.updatedAt,
    source: recorded.source,
  };
  writeOut(options, `${JSON.stringify(body, null, 2)}\n`);
  return 0;
}
