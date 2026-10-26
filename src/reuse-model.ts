export type SourceLanguage =
  | "java"
  | "kotlin"
  | "typescript"
  | "javascript"
  | "python";

export type ReuseSymbolKind = "constant" | "method" | "literal";

export type ReuseFindingCode =
  | "SHADOW_CONSTANT"
  | "DUPLICATE_LITERAL"
  | "NEAR_CLONE";

export type ReuseFindingReason = "same-literal" | "same-body" | "enum-fanout";

export interface ReuseSymbol {
  readonly language: SourceLanguage;
  readonly kind: ReuseSymbolKind;
  readonly name: string;
  readonly file: string;
  readonly startLine: number;
  readonly signature: string;
  readonly parameterTypes: readonly string[];
  readonly literalValue: string | null;
  readonly bodyHash: string | null;
  readonly tokenCount: number;
  readonly significantTokens: number;
}

export interface ReuseFinding {
  readonly code: ReuseFindingCode;
  readonly reason: ReuseFindingReason;
  readonly canonical: ReuseSymbol;
  readonly duplicate: ReuseSymbol;
  readonly message: string;
}

export interface ReuseAuditOptions {
  readonly minBodyTokens: number;
  readonly minSignificantTokens: number;
  readonly minLiteralLength: number;
  readonly rawLiteralMinLength: number;
}

export const DEFAULT_REUSE_AUDIT_OPTIONS: ReuseAuditOptions = {
  minBodyTokens: 12,
  minSignificantTokens: 2,
  minLiteralLength: 4,
  rawLiteralMinLength: 12,
};

export interface ReuseAuditReport {
  readonly findings: readonly ReuseFinding[];
  readonly candidateCount: number;
  readonly poolCount: number;
}
