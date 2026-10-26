import type { SQLOutputValue } from "node:sqlite";

export function readSqlString(value: SQLOutputValue | undefined): string | null {
  return typeof value === "string" ? value : null;
}

export function readSqlNumber(value: SQLOutputValue | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "bigint" && value <= BigInt(Number.MAX_SAFE_INTEGER)) {
    return Number(value);
  }
  return null;
}
