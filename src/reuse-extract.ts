import { createHash } from "node:crypto";
import type { ReuseSymbol, SourceLanguage } from "./reuse-model.js";

const PRESERVED_WORDS = new Set<string>([
  "if",
  "else",
  "elif",
  "return",
  "for",
  "while",
  "do",
  "switch",
  "case",
  "throw",
  "new",
  "try",
  "catch",
  "finally",
  "break",
  "continue",
  "await",
  "async",
  "yield",
  "is",
  "in",
  "not",
  "and",
  "or",
  "raise",
  "except",
  "assert",
  "instanceof",
  "typeof",
]);

const CONTROL_NAMES = new Set<string>([
  "if",
  "for",
  "while",
  "switch",
  "catch",
  "synchronized",
  "with",
  "when",
  "foreach",
]);

const LITERAL_WORDS = new Set<string>([
  "true",
  "false",
  "null",
  "undefined",
  "None",
  "True",
  "False",
  "nil",
]);

const PUNCTUATION = new Set<string>([
  "(",
  ")",
  "{",
  "}",
  "[",
  "]",
  ";",
  ",",
  ".",
  ":",
  "?",
]);

const TOKEN_PATTERN =
  /[A-Za-z_][A-Za-z0-9_]*|"""[\s\S]*?"""|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|-?\d[\d_]*(?:\.\d+)?|==|!=|<=|>=|&&|\|\||->|=>|\S/g;

const JAVA_CONSTANT_PATTERN =
  /\bstatic\s+final\s+[^;=]{0,180}?\b([A-Za-z_][A-Za-z0-9_]*)\s*=\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g;

const KOTLIN_CONSTANT_PATTERN =
  /\bconst\s+val\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?::[^=;\n]+)?=\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g;

const TYPESCRIPT_CONSTANT_PATTERN =
  /\bconst\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?::[^=;\n]+)?=\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\$])*`)/g;

const PYTHON_CONSTANT_PATTERN =
  /(?:^|\n)[ \t]*([A-Z][A-Z0-9_]*)\s*=\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g;

export function languageFromPath(filePath: string): SourceLanguage | null {
  const normalized = filePath.replace(/\\/g, "/");
  if (normalized.endsWith(".java")) {
    return "java";
  }
  if (normalized.endsWith(".kt") || normalized.endsWith(".kts")) {
    return "kotlin";
  }
  if (normalized.endsWith(".ts") || normalized.endsWith(".tsx")) {
    return "typescript";
  }
  if (
    normalized.endsWith(".js") ||
    normalized.endsWith(".jsx") ||
    normalized.endsWith(".mjs")
  ) {
    return "javascript";
  }
  if (normalized.endsWith(".py")) {
    return "python";
  }
  return null;
}

export function isTestPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  return (
    /\/(?:test|tests|__tests__)(?:\/|$)/.test(normalized) ||
    /(?:^|\/)[^/]*(?:Test|Tests|Spec)\.(?:java|kt|kts)$/.test(normalized) ||
    /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(normalized) ||
    /(?:^|\/)test_[^/]+\.py$/.test(normalized) ||
    /(?:^|\/)[^/]+_test\.py$/.test(normalized)
  );
}

export interface NormalizedBody {
  readonly hash: string;
  readonly tokenCount: number;
  readonly significantTokens: number;
}

export function normalizeMethodBody(body: string): NormalizedBody {
  const stripped = maskComments(body, true);
  const matched = stripped.match(TOKEN_PATTERN) ?? [];
  const mapped: string[] = [];
  let significantTokens = 0;
  for (const token of matched) {
    const normalized = normalizeToken(token);
    mapped.push(normalized);
    if (!PUNCTUATION.has(normalized) && normalized !== "ID") {
      significantTokens += 1;
    }
  }
  const serialized = mapped.join(" ");
  return {
    hash: createHash("sha256").update(serialized).digest("hex"),
    tokenCount: mapped.length,
    significantTokens,
  };
}

export function extractReuseSymbols(
  filePath: string,
  source: string,
): readonly ReuseSymbol[] {
  const language = languageFromPath(filePath);
  if (language === null) {
    return [];
  }
  const masked = maskComments(source, language === "python");
  const constants = extractConstants(filePath, language, masked);
  const walked = walkDeclarations(filePath, language, source);
  const constantLines = new Set(
    constants
      .filter((symbol) => symbol.literalValue !== null)
      .map((symbol) => `${symbol.startLine}\0${symbol.literalValue ?? ""}`),
  );
  const literals = walked.literals.filter(
    (symbol) => !constantLines.has(`${symbol.startLine}\0${symbol.literalValue ?? ""}`),
  );
  if (language === "python") {
    return [...constants, ...extractPythonMethods(filePath, masked), ...literals];
  }
  return [...constants, ...walked.methods, ...literals];
}

function normalizeToken(token: string): string {
  if (
    token.startsWith('"""') ||
    token.startsWith('"') ||
    token.startsWith("'") ||
    token.startsWith("`")
  ) {
    return "STR";
  }
  if (/^-?\d/.test(token)) {
    return "NUM";
  }
  if (LITERAL_WORDS.has(token)) {
    return "LIT";
  }
  if (/^[A-Za-z_]/.test(token)) {
    return PRESERVED_WORDS.has(token) ? token : "ID";
  }
  return token;
}

function extractConstants(
  filePath: string,
  language: SourceLanguage,
  masked: string,
): readonly ReuseSymbol[] {
  const pattern = constantPattern(language);
  const symbols: ReuseSymbol[] = [];
  for (const match of masked.matchAll(pattern)) {
    const name = match[1];
    const rawLiteral = match[2];
    const index = match.index;
    if (name === undefined || rawLiteral === undefined) {
      continue;
    }
    const nameOffset = match[0].lastIndexOf(name);
    const nameIndex = index + (nameOffset >= 0 ? nameOffset : 0);
    const literalValue = decodeLiteral(rawLiteral);
    if (literalValue.length === 0) {
      continue;
    }
    symbols.push({
      language,
      kind: "constant",
      name,
      file: filePath,
      startLine: lineNumberAt(masked, nameIndex),
      signature: literalValue,
      parameterTypes: [],
      literalValue,
      bodyHash: null,
      tokenCount: literalValue.length,
      significantTokens: 0,
    });
  }
  return symbols;
}

function constantPattern(language: SourceLanguage): RegExp {
  if (language === "java") {
    return new RegExp(JAVA_CONSTANT_PATTERN);
  }
  if (language === "kotlin") {
    return new RegExp(KOTLIN_CONSTANT_PATTERN);
  }
  if (language === "python") {
    return new RegExp(PYTHON_CONSTANT_PATTERN);
  }
  return new RegExp(TYPESCRIPT_CONSTANT_PATTERN);
}

interface WalkResult {
  readonly methods: readonly ReuseSymbol[];
  readonly literals: readonly ReuseSymbol[];
}

function walkDeclarations(
  filePath: string,
  language: SourceLanguage,
  source: string,
): WalkResult {
  const methods: ReuseSymbol[] = [];
  const literals: ReuseSymbol[] = [];
  let index = 0;
  let line = 1;
  while (index < source.length) {
    const current = charAt(source, index);
    const next = charAt(source, index + 1);
    if (current === "\n") {
      line += 1;
      index += 1;
      continue;
    }
    if (language === "python" && current === "#") {
      while (index < source.length && charAt(source, index) !== "\n") {
        index += 1;
      }
      continue;
    }
    if (current === "/" && next === "/") {
      while (index < source.length && charAt(source, index) !== "\n") {
        index += 1;
      }
      continue;
    }
    if (current === "/" && next === "*") {
      index += 2;
      while (
        index < source.length &&
        !(charAt(source, index) === "*" && charAt(source, index + 1) === "/")
      ) {
        if (charAt(source, index) === "\n") {
          line += 1;
        }
        index += 1;
      }
      index += 2;
      continue;
    }
    if (current === '"' || current === "'" || current === "`") {
      const parsed = readQuoted(source, index, line);
      if (parsed.literalValue !== null && isDomainLiteral(parsed.literalValue)) {
        literals.push(
          literalSymbol(filePath, language, parsed.literalValue, parsed.startLine),
        );
      }
      index = parsed.end;
      line = parsed.endLine;
      continue;
    }
    if (current === "(" && language !== "python") {
      const method = tryMethod(filePath, language, source, index, line);
      if (method !== null) {
        methods.push(method.symbol);
        index = method.resumeAt;
        line = method.resumeLine;
        continue;
      }
    }
    index += 1;
  }
  return { methods, literals };
}

interface QuotedRead {
  readonly literalValue: string | null;
  readonly end: number;
  readonly endLine: number;
  readonly startLine: number;
}

function readQuoted(source: string, start: number, startLine: number): QuotedRead {
  const triple =
    charAt(source, start) === '"' &&
    charAt(source, start + 1) === '"' &&
    charAt(source, start + 2) === '"';
  if (triple) {
    return readUntil(source, start + 3, startLine, '"""', startLine);
  }
  const quote = charAt(source, start);
  return readUntil(source, start + 1, startLine, quote, startLine);
}

function readUntil(
  source: string,
  contentStart: number,
  startLine: number,
  terminator: string,
  literalLine: number,
): QuotedRead {
  let index = contentStart;
  let line = startLine;
  let raw = "";
  let dynamic = false;
  while (index < source.length) {
    if (terminator.length === 3) {
      if (
        charAt(source, index) === '"' &&
        charAt(source, index + 1) === '"' &&
        charAt(source, index + 2) === '"'
      ) {
        return {
          literalValue: dynamic ? null : unescapeText(raw),
          end: index + 3,
          endLine: line,
          startLine: literalLine,
        };
      }
    } else if (charAt(source, index) === terminator) {
      return {
        literalValue: dynamic ? null : unescapeText(raw),
        end: index + 1,
        endLine: line,
        startLine: literalLine,
      };
    }
    const current = charAt(source, index);
    if (current === "\n") {
      line += 1;
    }
    if (current === "\\") {
      raw += current + charAt(source, index + 1);
      if (charAt(source, index + 1) === "\n") {
        line += 1;
      }
      index += 2;
      continue;
    }
    if (terminator === "`" && current === "$" && charAt(source, index + 1) === "{") {
      dynamic = true;
    }
    raw += current;
    index += 1;
  }
  return {
    literalValue: null,
    end: source.length,
    endLine: line,
    startLine: literalLine,
  };
}

interface MethodHit {
  readonly symbol: ReuseSymbol;
  readonly resumeAt: number;
  readonly resumeLine: number;
}

function tryMethod(
  filePath: string,
  language: SourceLanguage,
  source: string,
  parenIndex: number,
  parenLine: number,
): MethodHit | null {
  const close = findMatchingParen(source, parenIndex);
  if (close === null) {
    return null;
  }
  const nameInfo = readNameBefore(source, parenIndex);
  if (nameInfo === null || CONTROL_NAMES.has(nameInfo.name)) {
    return null;
  }
  const bodyOpen = indexOfBodyOpen(source, close + 1);
  if (bodyOpen === null) {
    return null;
  }
  const bodyClose = findMatchingBrace(source, bodyOpen);
  if (bodyClose === null) {
    return null;
  }
  const params = source.slice(parenIndex + 1, close);
  const parameterTypes = parseParameterTypes(params);
  const body = source.slice(bodyOpen + 1, bodyClose);
  const normalized = normalizeMethodBody(body);
  const signature = `${nameInfo.name}(${parameterTypes.join(",")})`;
  return {
    symbol: {
      language,
      kind: "method",
      name: nameInfo.name,
      file: filePath,
      startLine: nameInfo.line,
      signature,
      parameterTypes,
      literalValue: null,
      bodyHash: normalized.hash,
      tokenCount: normalized.tokenCount,
      significantTokens: normalized.significantTokens,
    },
    resumeAt: bodyOpen,
    resumeLine: parenLine + countNewlines(source.slice(parenIndex, bodyOpen)),
  };
}

function extractPythonMethods(
  filePath: string,
  source: string,
): readonly ReuseSymbol[] {
  const lines = source.split(/\r?\n/);
  const symbols: ReuseSymbol[] = [];
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? "";
    const header = /^([ \t]*)(?:async[ \t]+)?def[ \t]+([A-Za-z_][A-Za-z0-9_]*)[ \t]*\(/.exec(
      line,
    );
    if (header === null) {
      continue;
    }
    const indentText = header[1] ?? "";
    const name = header[2];
    if (name === undefined) {
      continue;
    }
    const collected = collectPythonSignature(lines, lineIndex);
    if (collected === null) {
      continue;
    }
    const bodyLines: string[] = [];
    for (let cursor = collected.nextLine; cursor < lines.length; cursor += 1) {
      const bodyLine = lines[cursor] ?? "";
      if (bodyLine.trim().length === 0) {
        bodyLines.push(bodyLine);
        continue;
      }
      const bodyIndent = /^[ \t]*/.exec(bodyLine)?.[0].length ?? 0;
      if (bodyIndent <= indentText.length) {
        break;
      }
      bodyLines.push(bodyLine);
    }
    const parameterTypes = parseParameterTypes(collected.params);
    const normalized = normalizeMethodBody(bodyLines.join("\n"));
    symbols.push({
      language: "python",
      kind: "method",
      name,
      file: filePath,
      startLine: lineIndex + 1,
      signature: `${name}(${parameterTypes.join(",")})`,
      parameterTypes,
      literalValue: null,
      bodyHash: normalized.hash,
      tokenCount: normalized.tokenCount,
      significantTokens: normalized.significantTokens,
    });
  }
  return symbols;
}

function collectPythonSignature(
  lines: readonly string[],
  startLine: number,
): { readonly params: string; readonly nextLine: number } | null {
  let buffer = "";
  let depth = 0;
  let started = false;
  for (let cursor = startLine; cursor < lines.length; cursor += 1) {
    const line = lines[cursor] ?? "";
    const sliceStart = started ? 0 : line.indexOf("(");
    if (sliceStart < 0) {
      return null;
    }
    for (let index = sliceStart; index < line.length; index += 1) {
      const current = charAt(line, index);
      if (current === "(") {
        if (started) {
          buffer += current;
        }
        depth += 1;
        started = true;
        continue;
      }
      if (!started) {
        continue;
      }
      if (current === ")") {
        depth -= 1;
        if (depth === 0) {
          return { params: buffer, nextLine: cursor + 1 };
        }
      }
      buffer += current;
    }
    buffer += "\n";
  }
  return null;
}

function parseParameterTypes(params: string): readonly string[] {
  const parts = splitTopLevel(params, ",");
  const types: string[] = [];
  for (const part of parts) {
    const cleaned = part
      .replace(/@\w+(?:\([^)]*\))?/g, "")
      .replace(/\bfinal\b/g, "")
      .trim();
    if (cleaned.length === 0 || cleaned === "self" || cleaned === "cls") {
      continue;
    }
    const typed = parameterType(cleaned);
    if (typed.length > 0) {
      types.push(normalizeTypeName(typed));
    }
  }
  return types;
}

function parameterType(param: string): string {
  const withoutDefault = param.replace(/=[\s\S]*$/, "").trim();
  const colon = withoutDefault.indexOf(":");
  if (colon >= 0) {
    return withoutDefault.slice(colon + 1).trim();
  }
  const tokens = withoutDefault.split(/\s+/).filter((token) => token.length > 0);
  if (tokens.length <= 1) {
    return tokens[0] ?? "";
  }
  tokens.pop();
  return tokens.join(" ");
}

function normalizeTypeName(typeName: string): string {
  return typeName
    .replace(/\s+/g, "")
    .replace(/\b(?:java\.lang\.|kotlin\.)/g, "");
}

function isDomainLiteral(value: string): boolean {
  return value.length > 0 && !/[\s/\\:]/.test(value) && !value.startsWith(".");
}

function literalSymbol(
  filePath: string,
  language: SourceLanguage,
  literalValue: string,
  startLine: number,
): ReuseSymbol {
  return {
    language,
    kind: "literal",
    name: "<literal>",
    file: filePath,
    startLine,
    signature: literalValue,
    parameterTypes: [],
    literalValue,
    bodyHash: null,
    tokenCount: literalValue.length,
    significantTokens: 0,
  };
}

function splitTopLevel(input: string, separator: string): readonly string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  let quote: string | null = null;
  for (let index = 0; index < input.length; index += 1) {
    const currentChar = charAt(input, index);
    if (quote !== null) {
      current += currentChar;
      if (currentChar === "\\") {
        current += charAt(input, index + 1);
        index += 1;
        continue;
      }
      if (currentChar === quote) {
        quote = null;
      }
      continue;
    }
    if (currentChar === '"' || currentChar === "'" || currentChar === "`") {
      quote = currentChar;
      current += currentChar;
      continue;
    }
    if (currentChar === "(" || currentChar === "<" || currentChar === "[") {
      depth += 1;
    } else if (currentChar === ")" || currentChar === ">" || currentChar === "]") {
      depth = Math.max(0, depth - 1);
    } else if (currentChar === separator && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += currentChar;
  }
  if (current.trim().length > 0) {
    parts.push(current.trim());
  }
  return parts;
}

function findMatchingParen(source: string, openIndex: number): number | null {
  return findMatching(source, openIndex, "(", ")");
}

function findMatchingBrace(source: string, openIndex: number): number | null {
  return findMatching(source, openIndex, "{", "}");
}

function findMatching(
  source: string,
  openIndex: number,
  openChar: string,
  closeChar: string,
): number | null {
  let depth = 0;
  let quote: string | null = null;
  for (let index = openIndex; index < source.length; index += 1) {
    const current = charAt(source, index);
    const next = charAt(source, index + 1);
    if (quote !== null) {
      if (current === "\\") {
        index += 1;
        continue;
      }
      if (current === quote) {
        quote = null;
      }
      continue;
    }
    if (current === "/" && next === "/") {
      while (index < source.length && charAt(source, index) !== "\n") {
        index += 1;
      }
      continue;
    }
    if (current === "/" && next === "*") {
      index += 2;
      while (
        index < source.length &&
        !(charAt(source, index) === "*" && charAt(source, index + 1) === "/")
      ) {
        index += 1;
      }
      continue;
    }
    if (current === '"' || current === "'" || current === "`") {
      quote = current;
      continue;
    }
    if (current === openChar) {
      depth += 1;
    } else if (current === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return null;
}

function readNameBefore(
  source: string,
  parenIndex: number,
): { readonly name: string; readonly line: number } | null {
  let index = parenIndex - 1;
  while (index >= 0 && /\s/.test(charAt(source, index))) {
    index -= 1;
  }
  if (charAt(source, index) === ">") {
    index = skipBackAngle(source, index);
    while (index >= 0 && /\s/.test(charAt(source, index))) {
      index -= 1;
    }
  }
  const end = index;
  while (index >= 0 && /[A-Za-z0-9_]/.test(charAt(source, index))) {
    index -= 1;
  }
  const name = source.slice(index + 1, end + 1);
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    return null;
  }
  return { name, line: lineNumberAt(source, index + 1) };
}

function skipBackAngle(source: string, closeIndex: number): number {
  let depth = 0;
  for (let index = closeIndex; index >= 0; index -= 1) {
    const current = charAt(source, index);
    if (current === ">") {
      depth += 1;
    } else if (current === "<") {
      depth -= 1;
      if (depth === 0) {
        return index - 1;
      }
    }
  }
  return -1;
}

function indexOfBodyOpen(source: string, start: number): number | null {
  let index = start;
  let depth = 0;
  let allowsComma = false;
  while (index < source.length) {
    const current = charAt(source, index);
    const next = charAt(source, index + 1);
    if (depth === 0 && current === "{") {
      return index;
    }
    if (depth === 0 && (current === ";" || current === ",")) {
      if (!(current === "," && allowsComma)) {
        return null;
      }
    }
    if (depth === 0 && current === ")") {
      return null;
    }
    if (
      depth === 0 &&
      current === "=" &&
      next !== "=" &&
      next !== ">" &&
      charAt(source, index - 1) !== "=" &&
      charAt(source, index - 1) !== "!" &&
      charAt(source, index - 1) !== "<" &&
      charAt(source, index - 1) !== ">"
    ) {
      return null;
    }
    if (current === "<" || current === "(" || current === "[") {
      depth += 1;
    } else if (current === ">" || current === ")" || current === "]") {
      depth = Math.max(0, depth - 1);
    } else if (depth === 0 && wordAt(source, index) === "throws") {
      allowsComma = true;
    }
    if (current === '"' || current === "'" || current === "`") {
      index = readQuoted(source, index, 1).end;
      continue;
    }
    index += 1;
  }
  return null;
}

function wordAt(source: string, index: number): string {
  if (!/[A-Za-z_]/.test(charAt(source, index))) {
    return "";
  }
  if (index > 0 && /[A-Za-z0-9_]/.test(charAt(source, index - 1))) {
    return "";
  }
  let end = index;
  while (/[A-Za-z0-9_]/.test(charAt(source, end))) {
    end += 1;
  }
  return source.slice(index, end);
}

function maskComments(source: string, hashComments: boolean): string {
  let output = "";
  let index = 0;
  while (index < source.length) {
    const current = charAt(source, index);
    const next = charAt(source, index + 1);
    if (current === "/" && next === "/") {
      while (index < source.length && charAt(source, index) !== "\n") {
        output += " ";
        index += 1;
      }
      continue;
    }
    if (current === "/" && next === "*") {
      output += "  ";
      index += 2;
      while (
        index < source.length &&
        !(charAt(source, index) === "*" && charAt(source, index + 1) === "/")
      ) {
        output += charAt(source, index) === "\n" ? "\n" : " ";
        index += 1;
      }
      output += "  ";
      index += 2;
      continue;
    }
    if (hashComments && current === "#") {
      while (index < source.length && charAt(source, index) !== "\n") {
        output += " ";
        index += 1;
      }
      continue;
    }
    if (current === '"' || current === "'" || current === "`") {
      const parsed = readQuoted(source, index, 1);
      output += source.slice(index, parsed.end);
      index = parsed.end;
      continue;
    }
    output += current;
    index += 1;
  }
  return output;
}

function decodeLiteral(raw: string): string {
  if (raw.startsWith('"""') && raw.endsWith('"""')) {
    return unescapeText(raw.slice(3, -3));
  }
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'")) ||
    (raw.startsWith("`") && raw.endsWith("`"))
  ) {
    return unescapeText(raw.slice(1, -1));
  }
  return raw;
}

function unescapeText(value: string): string {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\r/g, "\r")
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, "\\");
}

function lineNumberAt(source: string, index: number): number {
  let line = 1;
  const stop = Math.min(index, source.length);
  for (let cursor = 0; cursor < stop; cursor += 1) {
    if (charAt(source, cursor) === "\n") {
      line += 1;
    }
  }
  return line;
}

function countNewlines(value: string): number {
  let count = 0;
  for (const current of value) {
    if (current === "\n") {
      count += 1;
    }
  }
  return count;
}

function charAt(value: string, index: number): string {
  return value[index] ?? "";
}
