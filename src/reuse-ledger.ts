import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync, type SQLOutputValue } from "node:sqlite";
import { readSqlNumber, readSqlString } from "./sql-cells.js";
import type { ReuseSymbol, ReuseSymbolKind, SourceLanguage } from "./reuse-model.js";

const CREATE_FILES = `
CREATE TABLE IF NOT EXISTS reuse_files (
  file TEXT PRIMARY KEY,
  content_hash TEXT NOT NULL,
  language TEXT NOT NULL
)`;

const CREATE_META = `
CREATE TABLE IF NOT EXISTS reuse_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
)`;

const EXTRACTOR_VERSION = "2";

const CREATE_SYMBOLS = `
CREATE TABLE IF NOT EXISTS reuse_symbols (
  file TEXT NOT NULL,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  signature TEXT NOT NULL,
  parameter_types TEXT NOT NULL,
  literal_value TEXT,
  body_hash TEXT,
  token_count INTEGER NOT NULL,
  significant_tokens INTEGER NOT NULL,
  start_line INTEGER NOT NULL,
  language TEXT NOT NULL
)`;

export interface ReuseLedger {
  readFileHash(filePath: string): string | null;
  readSymbols(filePath: string): readonly ReuseSymbol[];
  replaceFile(
    filePath: string,
    contentHash: string,
    symbols: readonly ReuseSymbol[],
  ): void;
  deleteFile(filePath: string): void;
  listFiles(): readonly string[];
  close(): void;
}

export function openReuseLedger(dbPath: string): ReuseLedger {
  if (dbPath !== ":memory:") {
    mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  db.exec(CREATE_FILES);
  db.exec(CREATE_SYMBOLS);
  db.exec(CREATE_META);
  const storedVersion = readMeta(db, "extractor_version");
  if (storedVersion !== EXTRACTOR_VERSION) {
    db.exec("DELETE FROM reuse_symbols");
    db.exec("DELETE FROM reuse_files");
    writeMeta(db, "extractor_version", EXTRACTOR_VERSION);
  }
  return {
    readFileHash(filePath): string | null {
      const row = db
        .prepare("SELECT content_hash FROM reuse_files WHERE file = ?")
        .get(filePath);
      return row === undefined ? null : cellString(row["content_hash"]);
    },
    readSymbols(filePath): readonly ReuseSymbol[] {
      const rows = db
        .prepare(
          `SELECT file, kind, name, signature, parameter_types, literal_value,
                  body_hash, token_count, significant_tokens, start_line, language
           FROM reuse_symbols WHERE file = ? ORDER BY start_line, name`,
        )
        .all(filePath);
      const symbols: ReuseSymbol[] = [];
      for (const row of rows) {
        const symbol = parseSymbolRow(row);
        if (symbol !== null) {
          symbols.push(symbol);
        }
      }
      return symbols;
    },
    replaceFile(filePath, contentHash, symbols): void {
      const language = symbols[0]?.language ?? "java";
      db.prepare("DELETE FROM reuse_symbols WHERE file = ?").run(filePath);
      db.prepare(
        `INSERT INTO reuse_files (file, content_hash, language)
         VALUES (?, ?, ?)
         ON CONFLICT(file) DO UPDATE SET
           content_hash = excluded.content_hash,
           language = excluded.language`,
      ).run(filePath, contentHash, language);
      const insert = db.prepare(
        `INSERT INTO reuse_symbols (
           file, kind, name, signature, parameter_types, literal_value, body_hash,
           token_count, significant_tokens, start_line, language
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const symbol of symbols) {
        insert.run(
          symbol.file,
          symbol.kind,
          symbol.name,
          symbol.signature,
          JSON.stringify(symbol.parameterTypes),
          symbol.literalValue,
          symbol.bodyHash,
          symbol.tokenCount,
          symbol.significantTokens,
          symbol.startLine,
          symbol.language,
        );
      }
    },
    deleteFile(filePath): void {
      db.prepare("DELETE FROM reuse_symbols WHERE file = ?").run(filePath);
      db.prepare("DELETE FROM reuse_files WHERE file = ?").run(filePath);
    },
    listFiles(): readonly string[] {
      const rows = db.prepare("SELECT file FROM reuse_files ORDER BY file").all();
      const files: string[] = [];
      for (const row of rows) {
        const filePath = cellString(row["file"]);
        if (filePath !== null) {
          files.push(filePath);
        }
      }
      return files;
    },
    close(): void {
      db.close();
    },
  };
}

function readMeta(db: DatabaseSync, key: string): string | null {
  const row = db.prepare("SELECT value FROM reuse_meta WHERE key = ?").get(key);
  if (row === undefined) {
    return null;
  }
  return cellString(row["value"]);
}

function writeMeta(db: DatabaseSync, key: string, value: string): void {
  db.prepare(
    `INSERT INTO reuse_meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value);
}

function parseSymbolRow(row: Record<string, SQLOutputValue>): ReuseSymbol | null {
  const filePath = cellString(row["file"]);
  const kind = cellKind(row["kind"]);
  const name = cellString(row["name"]);
  const signature = cellString(row["signature"]);
  const language = cellLanguage(row["language"]);
  const tokenCount = cellNumber(row["token_count"]);
  const significantTokens = cellNumber(row["significant_tokens"]);
  const startLine = cellNumber(row["start_line"]);
  const parameterTypes = parseStringArray(cellString(row["parameter_types"]));
  if (
    filePath === null ||
    kind === null ||
    name === null ||
    signature === null ||
    language === null ||
    tokenCount === null ||
    significantTokens === null ||
    startLine === null ||
    parameterTypes === null
  ) {
    return null;
  }
  return {
    file: filePath,
    kind,
    name,
    signature,
    language,
    tokenCount,
    significantTokens,
    startLine,
    parameterTypes,
    literalValue: cellString(row["literal_value"]),
    bodyHash: cellString(row["body_hash"]),
  };
}

function parseStringArray(value: string | null): readonly string[] | null {
  if (value === null) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || !parsed.every((entry) => typeof entry === "string")) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function cellString(value: SQLOutputValue | undefined): string | null {
  return readSqlString(value);
}

function cellNumber(value: SQLOutputValue | undefined): number | null {
  return readSqlNumber(value);
}

function cellKind(value: SQLOutputValue | undefined): ReuseSymbolKind | null {
  if (value === "constant" || value === "method" || value === "literal") {
    return value;
  }
  return null;
}

function cellLanguage(value: SQLOutputValue | undefined): SourceLanguage | null {
  if (
    value === "java" ||
    value === "kotlin" ||
    value === "typescript" ||
    value === "javascript" ||
    value === "python"
  ) {
    return value;
  }
  return null;
}
