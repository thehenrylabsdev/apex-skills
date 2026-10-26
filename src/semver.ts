export interface SemVer {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly prerelease: readonly string[];
}

const SEMVER_PATTERN =
  /^(0|[1-9]\d*)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

const COMPARATOR_PATTERN =
  /^(>=|<=|>|<|=|\^|~)?([0-9xX*]+)(?:\.([0-9xX*]+))?(?:\.([0-9xX*]+))?(?:-([0-9A-Za-z.-]+))?$/;

/**
 * Strips a leading `v`, build metadata, and legacy release suffixes so
 * registry-specific spellings compare as the same release.
 */
export function canonicalVersion(raw: string): string {
  return raw
    .trim()
    .replace(/^v(?=\d)/i, "")
    .replace(/\+[0-9A-Za-z.-]+$/, "")
    .replace(/\.(?:RELEASE|Final|GA)$/i, "");
}

export function parseSemver(raw: string): SemVer | null {
  const match = SEMVER_PATTERN.exec(canonicalVersion(raw));
  if (match === null) {
    return null;
  }
  const majorText = match[1];
  if (majorText === undefined) {
    return null;
  }
  const prerelease = match[4];
  return {
    major: Number(majorText),
    minor: match[2] === undefined ? 0 : Number(match[2]),
    patch: match[3] === undefined ? 0 : Number(match[3]),
    prerelease:
      prerelease === undefined || prerelease.length === 0
        ? []
        : prerelease.split("."),
  };
}

function compareIdentifiers(left: string, right: string): number {
  const leftNumeric = /^\d+$/.test(left);
  const rightNumeric = /^\d+$/.test(right);
  if (leftNumeric && rightNumeric) {
    return Number(left) - Number(right);
  }
  if (leftNumeric) {
    return -1;
  }
  if (rightNumeric) {
    return 1;
  }
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function comparePrerelease(
  left: readonly string[],
  right: readonly string[],
): number {
  if (left.length === 0 && right.length === 0) {
    return 0;
  }
  if (left.length === 0) {
    return 1;
  }
  if (right.length === 0) {
    return -1;
  }
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftId = left[index];
    const rightId = right[index];
    if (leftId === undefined) {
      return -1;
    }
    if (rightId === undefined) {
      return 1;
    }
    const compared = compareIdentifiers(leftId, rightId);
    if (compared !== 0) {
      return compared;
    }
  }
  return 0;
}

export function compareSemver(left: SemVer, right: SemVer): number {
  if (left.major !== right.major) {
    return left.major - right.major;
  }
  if (left.minor !== right.minor) {
    return left.minor - right.minor;
  }
  if (left.patch !== right.patch) {
    return left.patch - right.patch;
  }
  return comparePrerelease(left.prerelease, right.prerelease);
}

export function compareVersionStrings(left: string, right: string): number {
  const parsedLeft = parseSemver(left);
  const parsedRight = parseSemver(right);
  if (parsedLeft === null && parsedRight === null) {
    return left.localeCompare(right);
  }
  if (parsedLeft === null) {
    return -1;
  }
  if (parsedRight === null) {
    return 1;
  }
  return compareSemver(parsedLeft, parsedRight);
}

export function highestVersion(versions: readonly string[]): string | null {
  let best: string | null = null;
  for (const version of versions) {
    if (best === null || compareVersionStrings(version, best) > 0) {
      best = version;
    }
  }
  return best;
}

export function isStableRelease(raw: string): boolean {
  const canonical = canonicalVersion(raw);
  const parsed = parseSemver(canonical);
  if (parsed === null || parsed.prerelease.length > 0) {
    return false;
  }
  return !/(?:^|[-.])(?:alpha|beta|rc|cr|milestone|preview|snapshot|insiders|dev|pre)(?:[.\d]|$)/i.test(
    canonical,
  );
}

interface VersionParts {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly majorWild: boolean;
  readonly minorWild: boolean;
  readonly patchWild: boolean;
  readonly prerelease: readonly string[];
}

function wildPart(part: string | undefined): {
  readonly num: number;
  readonly wild: boolean;
} {
  if (
    part === undefined ||
    part === "x" ||
    part === "X" ||
    part === "*"
  ) {
    return { num: 0, wild: true };
  }
  return { num: Number(part), wild: false };
}

function versionAt(
  major: number,
  minor: number,
  patch: number,
  prerelease: readonly string[] = [],
): SemVer {
  return { major, minor, patch, prerelease };
}

function greaterThan(version: SemVer, boundary: SemVer): boolean {
  return compareSemver(version, boundary) > 0;
}

function greaterOrEqual(version: SemVer, boundary: SemVer): boolean {
  return compareSemver(version, boundary) >= 0;
}

function lessThan(version: SemVer, boundary: SemVer): boolean {
  return compareSemver(version, boundary) < 0;
}

function lessOrEqual(version: SemVer, boundary: SemVer): boolean {
  return compareSemver(version, boundary) <= 0;
}

function satisfiesComparator(version: SemVer, token: string): boolean {
  if (token === "*" || token === "x" || token === "X") {
    return true;
  }
  const match = COMPARATOR_PATTERN.exec(token);
  if (match === null) {
    return false;
  }
  const operator = match[1] ?? "=";
  const majorPart = wildPart(match[2]);
  const minorPart = wildPart(match[3]);
  const patchPart = wildPart(match[4]);
  const prereleaseText = match[5];
  const parts: VersionParts = {
    major: majorPart.num,
    minor: minorPart.num,
    patch: patchPart.num,
    majorWild: majorPart.wild,
    minorWild: minorPart.wild,
    patchWild: patchPart.wild,
    prerelease:
      prereleaseText === undefined || prereleaseText.length === 0
        ? []
        : prereleaseText.split("."),
  };
  const lower = versionAt(
    parts.major,
    parts.minor,
    parts.patch,
    parts.prerelease,
  );

  if (operator === ">") {
    return greaterThan(version, lower);
  }
  if (operator === ">=") {
    return greaterOrEqual(version, lower);
  }
  if (operator === "<") {
    return lessThan(version, lower);
  }
  if (operator === "<=") {
    return lessOrEqual(version, lower);
  }
  if (operator === "=") {
    return satisfiesBare(version, parts);
  }
  if (operator === "^") {
    return satisfiesCaret(version, parts);
  }
  return satisfiesTilde(version, parts);
}

function satisfiesBare(version: SemVer, parts: VersionParts): boolean {
  if (parts.minorWild) {
    return (
      version.major === parts.major &&
      greaterOrEqual(version, versionAt(parts.major, 0, 0)) &&
      lessThan(version, versionAt(parts.major + 1, 0, 0))
    );
  }
  if (parts.patchWild) {
    return (
      version.major === parts.major &&
      version.minor === parts.minor &&
      lessThan(version, versionAt(parts.major, parts.minor + 1, 0))
    );
  }
  return compareSemver(version, versionAt(parts.major, parts.minor, parts.patch, parts.prerelease)) === 0;
}

function satisfiesCaret(version: SemVer, parts: VersionParts): boolean {
  const lower = versionAt(parts.major, parts.minor, parts.patch);
  let upper: SemVer;
  if (parts.major > 0) {
    upper = versionAt(parts.major + 1, 0, 0);
  } else if (parts.minorWild || parts.minor > 0) {
    upper = parts.minorWild
      ? versionAt(1, 0, 0)
      : versionAt(0, parts.minor + 1, 0);
  } else if (parts.patchWild) {
    upper = versionAt(0, 1, 0);
  } else {
    upper = versionAt(0, 0, parts.patch + 1);
  }
  return greaterOrEqual(version, lower) && lessThan(version, upper);
}

function satisfiesTilde(version: SemVer, parts: VersionParts): boolean {
  const lower = versionAt(parts.major, parts.minor, parts.patch);
  const upper = parts.minorWild
    ? versionAt(parts.major + 1, 0, 0)
    : versionAt(parts.major, parts.minor + 1, 0);
  return greaterOrEqual(version, lower) && lessThan(version, upper);
}

function satisfiesClause(version: SemVer, clause: string): boolean {
  const hyphen = /^(.+?)\s+-\s+(.+)$/.exec(clause.trim());
  if (hyphen !== null) {
    const low = hyphen[1];
    const high = hyphen[2];
    if (low === undefined || high === undefined) {
      return false;
    }
    return (
      satisfiesComparator(version, `>=${low.trim()}`) &&
      satisfiesComparator(version, `<=${high.trim()}`)
    );
  }
  const parts = clause.trim().split(/\s+/).filter((part) => part.length > 0);
  if (parts.length === 0) {
    return true;
  }
  return parts.every((part) => satisfiesComparator(version, part));
}

/**
 * Returns whether `version` is inside a practical subset of the npm range
 * grammar (`||`, space-separated comparators, `^`, `~`, and partials).
 * A prerelease version matches only an explicit equality.
 */
export function satisfies(version: string, range: string): boolean {
  const trimmed = range.trim();
  if (trimmed.length === 0 || trimmed === "*" || trimmed === "x") {
    return true;
  }
  const parsed = parseSemver(version);
  if (parsed === null) {
    return false;
  }
  if (parsed.prerelease.length > 0) {
    return trimmed.split("||").some((clause) => {
      const token = clause.trim().replace(/^=/, "");
      return canonicalVersion(token) === canonicalVersion(version);
    });
  }
  const clauses = trimmed
    .split("||")
    .map((clause) => clause.trim())
    .filter((clause) => clause.length > 0);
  if (clauses.length === 0) {
    return true;
  }
  return clauses.some((clause) => satisfiesClause(parsed, clause));
}

export function normalizeRange(raw: string, kind: "peer" | "developed"): string {
  const trimmed = raw.trim().replace(/~=/g, "~").replace(/,/g, " ");
  if (trimmed.length === 0 || trimmed === "*") {
    return "*";
  }
  const hasOperator = /^(>=|<=|>|<|=|\^|~)/.test(trimmed);
  if (kind === "developed" && !hasOperator) {
    return `>=${canonicalVersion(trimmed)}`;
  }
  return trimmed;
}
