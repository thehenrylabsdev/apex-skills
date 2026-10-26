import type { AddedLine, SecretFinding } from "./scan-model.js";

interface SecretRule {
  readonly pattern: string;
  readonly expression: RegExp;
}

const RULES: readonly SecretRule[] = [
  {
    pattern: "private key",
    expression: /-----BEGIN (?:RSA |OPENSSH |EC |DSA |PGP )?PRIVATE KEY-----/,
  },
  { pattern: "AWS access key", expression: /\bAKIA[0-9A-Z]{16}\b/ },
  { pattern: "GitHub token", expression: /\bgh[pousr]_[A-Za-z0-9]{36}\b/ },
  { pattern: "GitHub fine-grained token", expression: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/ },
  { pattern: "GitLab token", expression: /\bglpat-[A-Za-z0-9\-_]{20,}\b/ },
  { pattern: "Slack token", expression: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { pattern: "Google API key", expression: /\bAIza[0-9A-Za-z\-_]{35}\b/ },
  { pattern: "npm token", expression: /\bnpm_[A-Za-z0-9]{36}\b/ },
  { pattern: "Stripe live key", expression: /\bsk_live_[0-9a-zA-Z]{16,}\b/ },
];

const ASSIGNMENT =
  /(?:password|passwd|secret|api[_-]?key|access[_-]?token|client[_-]?secret|private[_-]?key)\s*[:=]\s*["']([^"']+)["']/i;

const SKIP_FILE =
  /(?:^|\/)(?:package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|go\.sum)$/;

const BINARY_EXT =
  /\.(?:png|jpe?g|gif|webp|ico|pdf|woff2?|ttf|eot|jar|zip|gz|tgz|wasm|class|so|dylib|dll|exe|bin)$/i;

export function isScannableTextPath(file: string): boolean {
  const normalized = file.replace(/\\/g, "/");
  if (SKIP_FILE.test(normalized) || BINARY_EXT.test(normalized)) {
    return false;
  }
  const parts = normalized.split("/");
  return !parts.some(
    (part) =>
      part === "node_modules" ||
      part === "dist" ||
      part === "build" ||
      part === "coverage" ||
      part === "vendor" ||
      part === ".git" ||
      part === ".next" ||
      part === ".gradle" ||
      part === "target",
  );
}

export function findSecretFindings(lines: readonly AddedLine[]): readonly SecretFinding[] {
  const findings: SecretFinding[] = [];
  for (const added of lines) {
    if (!isScannableTextPath(added.file)) {
      continue;
    }
    const pattern = matchLine(added.text);
    if (pattern === null) {
      continue;
    }
    findings.push({ file: added.file, line: added.line, pattern });
  }
  return findings;
}

function matchLine(text: string): string | null {
  if (isIgnoredLine(text)) {
    return null;
  }
  for (const rule of RULES) {
    const match = rule.expression.exec(text);
    if (match?.[0] !== undefined && !isIgnoredValue(match[0])) {
      return rule.pattern;
    }
  }
  const assigned = ASSIGNMENT.exec(text);
  const value = assigned?.[1];
  if (value !== undefined && isCredentialValue(value)) {
    return "credential assignment";
  }
  return null;
}

function isIgnoredLine(text: string): boolean {
  return text.includes("sha512-") || text.includes("sha256-") || text.includes("sha1-");
}

function isIgnoredValue(value: string): boolean {
  return /example|redacted|placeholder/i.test(value);
}

function isCredentialValue(value: string): boolean {
  if (value.length < 16 || isIgnoredValue(value)) {
    return false;
  }
  if (/^(?:changeme|password|secret|token|sample|dummy|fake|test|xxx+|\*+|<.*>)$/i.test(value)) {
    return false;
  }
  if (value.startsWith("${") || value.startsWith("process.env") || value.includes(" ")) {
    return false;
  }
  if (/^[0-9a-f]{40}$/i.test(value)) {
    return false;
  }
  return /[A-Za-z]/.test(value) && /\d/.test(value);
}
