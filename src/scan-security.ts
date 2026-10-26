import { isTestPath } from "./reuse-extract.js";
import type { AddedLine } from "./scan-model.js";
import { isScannableTextPath } from "./scan-secrets.js";

export interface SecurityFinding {
  readonly file: string;
  readonly line: number;
  readonly rule: string;
  readonly summary: string;
}

interface SecurityRule {
  readonly rule: string;
  readonly expression: RegExp;
  readonly summary: string;
}

const RULES: readonly SecurityRule[] = [
  {
    rule: "eval",
    expression: /\beval\s*\(|\bnew\s+Function\s*\(/,
    summary: "Replace eval or new Function with an explicit operation.",
  },
  {
    rule: "deserialization",
    expression: /\bpickle\.(?:loads|load|Unpickler)\s*\(|\bObjectInputStream\b|\bBinaryFormatter\b/,
    summary: "Replace native deserialization with an explicit schema.",
  },
  {
    rule: "yaml-load",
    expression: /\byaml\.load\s*\(/,
    summary: "Load YAML through safe_load or SafeLoader.",
  },
  {
    rule: "html-injection",
    expression: /\bdangerouslySetInnerHTML\b|\.innerHTML\s*=|\bdocument\.write\s*\(/,
    summary: "Render text through the framework escape path.",
  },
  {
    rule: "tls-bypass",
    expression: /rejectUnauthorized\s*:\s*false|InsecureSkipVerify\s*:\s*true|\bverify\s*=\s*False\b/,
    summary: "Verify TLS certificates.",
  },
  {
    rule: "shell",
    expression: /\bshell\s*=\s*True\b|\.(?:exec|system)\s*\([^)\n]*\+/,
    summary: "Pass command arguments as an array and keep shell mode off.",
  },
];

const SOURCE_EXT =
  /\.(?:java|kt|kts|cs|go|swift|rs|php|py|rb|c|cc|cpp|h|hpp|m|mm|js|jsx|mjs|cjs|ts|tsx|vue|gd|lua|scala)$/i;

export function findSecurityFindings(lines: readonly AddedLine[]): readonly SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  for (const added of lines) {
    if (!isSecurityPath(added.file) || isTestPath(added.file) || isComment(added.text)) {
      continue;
    }
    for (const rule of RULES) {
      if (!rule.expression.test(added.text)) {
        continue;
      }
      findings.push({
        file: added.file,
        line: added.line,
        rule: rule.rule,
        summary: rule.summary,
      });
      break;
    }
  }
  return findings;
}

function isSecurityPath(file: string): boolean {
  return isScannableTextPath(file) && SOURCE_EXT.test(file.replace(/\\/g, "/"));
}

function isComment(text: string): boolean {
  const trimmed = text.trim();
  return (
    trimmed.startsWith("//") ||
    trimmed.startsWith("#") ||
    trimmed.startsWith("*") ||
    trimmed.startsWith("/*")
  );
}
