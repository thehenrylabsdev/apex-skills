import type {
  ReuseAuditOptions,
  ReuseAuditReport,
  ReuseFinding,
  ReuseSymbol,
} from "./reuse-model.js";

export function selectCandidateSymbols(
  baseline: readonly ReuseSymbol[],
  current: readonly ReuseSymbol[],
): readonly ReuseSymbol[] {
  const baselineCounts = occurrenceCounts(baseline);
  const grouped = groupByStructure(current);
  const candidates: ReuseSymbol[] = [];
  for (const [group, symbols] of grouped) {
    const alreadyPresent = baselineCounts.get(group) ?? 0;
    for (let index = alreadyPresent; index < symbols.length; index += 1) {
      const symbol = symbols[index];
      if (symbol !== undefined) {
        candidates.push(symbol);
      }
    }
  }
  return candidates;
}

export function auditReuse(
  candidates: readonly ReuseSymbol[],
  pool: readonly ReuseSymbol[],
  options: ReuseAuditOptions,
): ReuseAuditReport {
  const candidateRefs = new Set(candidates.map((symbol) => symbolRef(symbol)));
  const findings: ReuseFinding[] = [];
  const seenPairs = new Set<string>();

  for (const candidate of candidates) {
    if (candidate.kind === "constant") {
      collectConstantFindings(candidate, pool, candidateRefs, seenPairs, findings);
    } else if (candidate.kind === "method") {
      collectMethodFindings(
        candidate,
        pool,
        candidateRefs,
        seenPairs,
        findings,
        options,
      );
    } else {
      collectLiteralFindings(
        candidate,
        pool,
        candidateRefs,
        seenPairs,
        findings,
        options,
      );
    }
  }

  findings.sort((left, right) => {
    const byCode = left.code.localeCompare(right.code);
    if (byCode !== 0) {
      return byCode;
    }
    const byFile = left.duplicate.file.localeCompare(right.duplicate.file);
    if (byFile !== 0) {
      return byFile;
    }
    return left.duplicate.startLine - right.duplicate.startLine;
  });

  return {
    findings,
    candidateCount: candidates.length,
    poolCount: pool.length,
  };
}

export function formatReuseReport(report: ReuseAuditReport): string {
  if (report.findings.length === 0) {
    return `[Apex Reuse] ${report.candidateCount} new symbol(s) checked against ${report.poolCount}. No shadow constant, duplicate literal, or near-clone.\n`;
  }
  const lines = [
    `[Apex Reuse] ${report.findings.length} finding(s) across ${report.candidateCount} new symbol(s).`,
  ];
  for (const finding of report.findings) {
    lines.push(
      `[${finding.code} ${finding.reason}] ${displaySymbol(finding.duplicate)}`,
      `  canonical: ${displaySymbol(finding.canonical)}`,
      `  ${finding.message}`,
    );
  }
  return `${lines.join("\n")}\n`;
}

export function displaySymbol(symbol: ReuseSymbol): string {
  if (symbol.kind === "method") {
    return `${symbol.file}:${symbol.startLine} ${symbol.name}(${symbol.parameterTypes.join(", ")})`;
  }
  if (symbol.kind === "constant") {
    return `${symbol.file}:${symbol.startLine} ${symbol.name}=${JSON.stringify(symbol.literalValue)}`;
  }
  return `${symbol.file}:${symbol.startLine} ${JSON.stringify(symbol.literalValue)}`;
}

function collectConstantFindings(
  candidate: ReuseSymbol,
  pool: readonly ReuseSymbol[],
  candidateRefs: ReadonlySet<string>,
  seenPairs: Set<string>,
  findings: ReuseFinding[],
): void {
  for (const other of pool) {
    if (other.kind !== "constant" || other.literalValue !== candidate.literalValue) {
      continue;
    }
    pushPair(candidate, other, candidateRefs, seenPairs, findings, "SHADOW_CONSTANT", "same-literal");
  }
}

function collectLiteralFindings(
  candidate: ReuseSymbol,
  pool: readonly ReuseSymbol[],
  candidateRefs: ReadonlySet<string>,
  seenPairs: Set<string>,
  findings: ReuseFinding[],
  options: ReuseAuditOptions,
): void {
  const value = candidate.literalValue;
  if (value === null || value.length < options.minLiteralLength) {
    return;
  }
  const constants = pool.filter(
    (other) => other.kind === "constant" && other.literalValue === value,
  );
  if (constants.length > 0) {
    for (const other of constants) {
      pushPair(
        candidate,
        other,
        candidateRefs,
        seenPairs,
        findings,
        "DUPLICATE_LITERAL",
        "same-literal",
      );
    }
    return;
  }
  if (value.length < options.rawLiteralMinLength || !isDottedDomainCode(value)) {
    return;
  }
  for (const other of pool) {
    if (other.kind !== "literal" || other.literalValue !== value) {
      continue;
    }
    pushPair(
      candidate,
      other,
      candidateRefs,
      seenPairs,
      findings,
      "DUPLICATE_LITERAL",
      "same-literal",
    );
  }
}

function collectMethodFindings(
  candidate: ReuseSymbol,
  pool: readonly ReuseSymbol[],
  candidateRefs: ReadonlySet<string>,
  seenPairs: Set<string>,
  findings: ReuseFinding[],
  options: ReuseAuditOptions,
): void {
  if (
    candidate.bodyHash === null ||
    candidate.tokenCount < options.minFanoutTokens ||
    candidate.significantTokens < options.minSignificantTokens
  ) {
    return;
  }
  for (const other of pool) {
    if (other.kind !== "method" || other.bodyHash !== candidate.bodyHash) {
      continue;
    }
    if (
      other.tokenCount < options.minFanoutTokens ||
      other.significantTokens < options.minSignificantTokens
    ) {
      continue;
    }
    const sameTypes = sameParameterTypes(candidate.parameterTypes, other.parameterTypes);
    const minimum = sameTypes ? options.minBodyTokens : options.minFanoutTokens;
    if (candidate.tokenCount < minimum || other.tokenCount < minimum) {
      continue;
    }
    pushPair(
      candidate,
      other,
      candidateRefs,
      seenPairs,
      findings,
      "NEAR_CLONE",
      sameTypes ? "same-body" : "enum-fanout",
    );
  }
}

function pushPair(
  candidate: ReuseSymbol,
  other: ReuseSymbol,
  candidateRefs: ReadonlySet<string>,
  seenPairs: Set<string>,
  findings: ReuseFinding[],
  code: ReuseFinding["code"],
  reason: ReuseFinding["reason"],
): void {
  if (symbolRef(candidate) === symbolRef(other)) {
    return;
  }
  const pairKey = [symbolRef(candidate), symbolRef(other)].sort().join("|");
  if (seenPairs.has(pairKey)) {
    return;
  }
  seenPairs.add(pairKey);
  const canonical = preferCanonical(candidate, other, candidateRefs);
  const duplicate = canonical === candidate ? other : candidate;
  if (!candidateRefs.has(symbolRef(duplicate))) {
    return;
  }
  findings.push({
    code,
    reason,
    canonical,
    duplicate,
    message: findingMessage(code, reason, canonical, duplicate),
  });
}

function findingMessage(
  code: ReuseFinding["code"],
  reason: ReuseFinding["reason"],
  canonical: ReuseSymbol,
  duplicate: ReuseSymbol,
): string {
  if (code === "SHADOW_CONSTANT") {
    return `Call constant ${canonical.name} instead of declaring ${duplicate.name}.`;
  }
  if (code === "DUPLICATE_LITERAL" && canonical.kind === "constant") {
    return `Call constant ${canonical.name} instead of the literal ${JSON.stringify(duplicate.literalValue)}.`;
  }
  if (code === "DUPLICATE_LITERAL") {
    return `Declare one constant for ${JSON.stringify(canonical.literalValue)} and call it from both sites.`;
  }
  if (reason === "enum-fanout") {
    return `Add the input type or enum as a parameter of ${canonical.name} and call that method.`;
  }
  return `Call ${canonical.name} instead of copying its body into ${duplicate.name}.`;
}

function preferCanonical(
  left: ReuseSymbol,
  right: ReuseSymbol,
  candidateRefs: ReadonlySet<string>,
): ReuseSymbol {
  const leftIsNew = candidateRefs.has(symbolRef(left));
  const rightIsNew = candidateRefs.has(symbolRef(right));
  if (leftIsNew !== rightIsNew) {
    return leftIsNew ? right : left;
  }
  const leftRank = canonicalRank(left);
  const rightRank = canonicalRank(right);
  if (leftRank.home !== rightRank.home) {
    return leftRank.home < rightRank.home ? left : right;
  }
  if (leftRank.file !== rightRank.file) {
    return leftRank.file < rightRank.file ? left : right;
  }
  return leftRank.line <= rightRank.line ? left : right;
}

function canonicalRank(symbol: ReuseSymbol): {
  readonly home: number;
  readonly file: string;
  readonly line: number;
} {
  const home = /constant|codes|enums|messages|literals/i.test(symbol.file) ? 0 : 1;
  return { home, file: symbol.file, line: symbol.startLine };
}

function sameParameterTypes(
  left: readonly string[],
  right: readonly string[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((typeName, index) => typeName === right[index]);
}

function isDottedDomainCode(value: string): boolean {
  return /^[a-z][a-z0-9]*(?:\.[a-z0-9]+)+$/.test(value);
}

function occurrenceCounts(symbols: readonly ReuseSymbol[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const symbol of symbols) {
    const group = structuralGroup(symbol);
    counts.set(group, (counts.get(group) ?? 0) + 1);
  }
  return counts;
}

function groupByStructure(
  symbols: readonly ReuseSymbol[],
): ReadonlyMap<string, readonly ReuseSymbol[]> {
  const grouped = new Map<string, ReuseSymbol[]>();
  const ordered = [...symbols].sort(
    (left, right) =>
      left.startLine - right.startLine || left.name.localeCompare(right.name),
  );
  for (const symbol of ordered) {
    const group = structuralGroup(symbol);
    const existing = grouped.get(group);
    if (existing === undefined) {
      grouped.set(group, [symbol]);
    } else {
      existing.push(symbol);
    }
  }
  return grouped;
}

function structuralGroup(symbol: ReuseSymbol): string {
  return [
    symbol.file,
    symbol.kind,
    symbol.name,
    symbol.signature,
    symbol.literalValue ?? "",
    symbol.bodyHash ?? "",
  ].join("\0");
}

function symbolRef(symbol: ReuseSymbol): string {
  return `${symbol.file}:${symbol.startLine}:${symbol.kind}:${symbol.name}:${symbol.signature}`;
}
