import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { auditReuse, selectCandidateSymbols } from "../src/reuse-audit.js";
import { extractReuseSymbols, normalizeMethodBody } from "../src/reuse-extract.js";
import { openReuseLedger } from "../src/reuse-ledger.js";
import { DEFAULT_REUSE_AUDIT_OPTIONS } from "../src/reuse-model.js";
import { auditRepository } from "../src/reuse-scan.js";

const EVENT_CODES = `package com.acme.codes;

public final class EventCodes {
    public static final String ORDER_CREATED = "order.created";

    public Result handle(OrderStatus status) {
        if (status == null) {
            throw new IllegalArgumentException("missing");
        }
        return service.execute(status, true);
    }

    public String code() {
        return ORDER_CREATED;
    }
}
`;

const ORDER_SERVICE = `package com.acme.order;

public class OrderService {
    private static final String CREATED = "order.created";

    public Result handle(PaymentStatus status) {
        if (status == null) {
            throw new IllegalArgumentException("missing");
        }
        return service.execute(status, false);
    }

    public String code() {
        return CREATED;
    }
}
`;

void describe("Canonical reuse index", () => {
  void it("treats true and false fan-out as the same normalized body", () => {
    const legacy = normalizeMethodBody(`
      if (status == null) {
        throw new IllegalArgumentException("missing");
      }
      return service.execute(status, true);
    `);
    const current = normalizeMethodBody(`
      if (status == null) {
        throw new IllegalArgumentException("missing");
      }
      return service.execute(status, false);
    `);
    assert.equal(legacy.hash, current.hash);
    assert.ok(legacy.tokenCount >= 12);
    assert.ok(legacy.significantTokens >= 2);
  });

  void it("flags a shadow constant and an enum fan-out, and ignores a getter", () => {
    const canonical = extractReuseSymbols("src/codes/EventCodes.java", EVENT_CODES);
    const duplicate = extractReuseSymbols("src/order/OrderService.java", ORDER_SERVICE);
    const report = auditReuse(duplicate, [...canonical, ...duplicate], DEFAULT_REUSE_AUDIT_OPTIONS);
    const codes = report.findings.map((finding) => finding.code).sort();
    assert.deepEqual(codes, ["NEAR_CLONE", "SHADOW_CONSTANT"]);
    const clone = report.findings.find((finding) => finding.code === "NEAR_CLONE");
    if (clone === undefined) {
      throw new Error("expected a near-clone finding");
    }
    assert.equal(clone.reason, "enum-fanout");
    assert.equal(clone.canonical.name, "handle");
    assert.match(clone.canonical.file, /EventCodes/);
    const shadow = report.findings.find((finding) => finding.code === "SHADOW_CONSTANT");
    if (shadow === undefined) {
      throw new Error("expected a shadow-constant finding");
    }
    assert.equal(shadow.canonical.name, "ORDER_CREATED");
    assert.equal(shadow.duplicate.name, "CREATED");
  });

  void it("flags a raw literal that repeats a canonical constant", () => {
    const canonical = extractReuseSymbols("src/codes/EventCodes.java", EVENT_CODES);
    const caller = extractReuseSymbols(
      "src/order/Logger.java",
      `class Logger { void write() { log.info("order.created"); } }`,
    );
    const literals = caller.filter((symbol) => symbol.kind === "literal");
    const report = auditReuse(literals, [...canonical, ...caller], DEFAULT_REUSE_AUDIT_OPTIONS);
    assert.equal(report.findings.length, 1);
    const literalFinding = report.findings[0];
    if (literalFinding === undefined) {
      throw new Error("expected a duplicate literal");
    }
    assert.equal(literalFinding.code, "DUPLICATE_LITERAL");
    assert.equal(literalFinding.canonical.name, "ORDER_CREATED");
  });

  void it("flags a one-line enum fan-out and ignores a getter", () => {
    const source = (type: string, flag: string): string =>
      `class Handler { Result handle(${type} status) { return service.execute(status, ${flag}); } String id() { return this.id; } }`;
    const left = extractReuseSymbols("src/OrderHandler.java", source("OrderStatus", "true"));
    const right = extractReuseSymbols("src/PaymentHandler.java", source("PaymentStatus", "false"));
    const report = auditReuse(right, [...left, ...right], DEFAULT_REUSE_AUDIT_OPTIONS);
    const clones = report.findings.filter((finding) => finding.code === "NEAR_CLONE");
    assert.equal(clones.length, 1);
    const clone = clones[0];
    if (clone === undefined) {
      throw new Error("expected an enum fan-out");
    }
    assert.equal(clone.reason, "enum-fanout");
    assert.equal(clone.duplicate.name, "handle");
  });

  void it("does not flag a method whose body actually differs", () => {
    const left = extractReuseSymbols(
      "src/A.java",
      `class A { Result handle(OrderStatus status) { return billing.settle(status); } }`,
    );
    const right = extractReuseSymbols(
      "src/B.java",
      `class B { Result handle(PaymentStatus status) { audit.record(status); return shipping.dispatch(status); } }`,
    );
    const report = auditReuse(right, [...left, ...right], DEFAULT_REUSE_AUDIT_OPTIONS);
    assert.equal(report.findings.filter((finding) => finding.code === "NEAR_CLONE").length, 0);
  });

  void it("extracts Kotlin, TypeScript, and Python constants", () => {
    const kotlin = extractReuseSymbols(
      "Codes.kt",
      `const val ORDER_CREATED = "order.created"\nfun handle(status: OrderStatus): Result {\n  if (status == null) {\n    throw IllegalArgumentException("missing")\n  }\n  return service.execute(status, true)\n}\n`,
    );
    const typescript = extractReuseSymbols(
      "codes.ts",
      `export const ORDER_CREATED = "order.created";\nexport function handle(status: OrderStatus): Result {\n  if (status == null) {\n    throw new Error("missing");\n  }\n  return service.execute(status, true);\n}\n`,
    );
    const python = extractReuseSymbols(
      "codes.py",
      `ORDER_CREATED = "order.created"\n\ndef handle(status):\n    if status is None:\n        raise ValueError("missing")\n    return service.execute(status, True)\n`,
    );
    assert.equal(kotlin.find((symbol) => symbol.kind === "constant")?.name, "ORDER_CREATED");
    assert.equal(typescript.find((symbol) => symbol.kind === "constant")?.literalValue, "order.created");
    assert.equal(python.find((symbol) => symbol.kind === "constant")?.literalValue, "order.created");
    assert.equal(kotlin.find((symbol) => symbol.kind === "method")?.parameterTypes[0], "OrderStatus");
    assert.equal(typescript.find((symbol) => symbol.kind === "method")?.parameterTypes[0], "OrderStatus");
    assert.equal(python.find((symbol) => symbol.kind === "method")?.name, "handle");
    const other = extractReuseSymbols(
      "other.ts",
      `export function handle(status: PaymentStatus): Result {\n  if (status == null) {\n    throw new Error("missing");\n  }\n  return service.execute(status, false);\n}\n`,
    );
    const typed = auditReuse(
      other.filter((symbol) => symbol.kind === "method"),
      [
        ...typescript.filter((symbol) => symbol.kind === "method"),
        ...other.filter((symbol) => symbol.kind === "method"),
      ],
      DEFAULT_REUSE_AUDIT_OPTIONS,
    );
    const fanout = typed.findings[0];
    if (fanout === undefined) {
      throw new Error("expected a near-clone");
    }
    assert.equal(fanout.code, "NEAR_CLONE");
    assert.equal(fanout.reason, "enum-fanout");
  });

  void it("does not treat a call inside a method as its own method", () => {
    const symbols = extractReuseSymbols(
      "Run.ts",
      `export function run(input: string): string {\n  for (const version of [canonicalVersion(input), other]) {\n    return version;\n  }\n  return input;\n}\n`,
    );
    const methods = symbols
      .filter((symbol) => symbol.kind === "method")
      .map((symbol) => symbol.name);
    assert.deepEqual(methods, ["run"]);
  });

  void it("keeps an existing symbol out of the candidate set when only its line moved", () => {
    const baseline = extractReuseSymbols("src/codes/EventCodes.java", EVENT_CODES);
    const shifted = EVENT_CODES.replace("public final class", "\npublic final class");
    const current = extractReuseSymbols("src/codes/EventCodes.java", shifted);
    const candidates = selectCandidateSymbols(baseline, current);
    assert.equal(
      candidates.filter((symbol) => symbol.kind === "constant" || symbol.kind === "method").length,
      0,
    );
  });

  void it("round-trips symbols through the SQLite ledger", () => {
    const ledger = openReuseLedger(":memory:");
    const symbols = extractReuseSymbols("src/codes/EventCodes.java", EVENT_CODES);
    ledger.replaceFile("src/codes/EventCodes.java", "abc", symbols);
    assert.equal(ledger.readFileHash("src/codes/EventCodes.java"), "abc");
    const stored = ledger.readSymbols("src/codes/EventCodes.java");
    assert.equal(stored.length, symbols.length);
    assert.equal(stored.find((symbol) => symbol.kind === "constant")?.literalValue, "order.created");
    ledger.deleteFile("src/codes/EventCodes.java");
    assert.equal(ledger.readFileHash("src/codes/EventCodes.java"), null);
    ledger.close();
  });

  void it("fails the git audit when a new service redeclares a canonical constant and method", () => {
    const root = mkdtempSync(path.join(tmpdir(), "apex-reuse-"));
    try {
      const sourceDir = path.join(root, "src", "codes");
      mkdirSync(sourceDir, { recursive: true });
      writeFileSync(path.join(sourceDir, "EventCodes.java"), EVENT_CODES);
      git(root, ["init", "-b", "main"]);
      git(root, ["add", "."]);
      commit(root, "canonical symbols");
      const orderDir = path.join(root, "src", "order");
      mkdirSync(orderDir, { recursive: true });
      writeFileSync(path.join(orderDir, "OrderService.java"), ORDER_SERVICE);
      const report = auditRepository({
        root,
        base: "HEAD",
        includeTests: false,
        dbPath: path.join(root, ".apex", "reuse-index.sqlite"),
        options: DEFAULT_REUSE_AUDIT_OPTIONS,
      });
      assert.ok(report.findings.some((finding) => finding.code === "SHADOW_CONSTANT"));
      assert.ok(report.findings.some((finding) => finding.code === "NEAR_CLONE"));
      const clean = runCli(["audit", "--root", root, "--base", "HEAD"]);
      assert.equal(clean.code, 1);
      assert.match(clean.stdout, /SHADOW_CONSTANT/);
      const lookup = runCli(["lookup", "--root", root, "--literal", "order.created"]);
      assert.equal(lookup.code, 0);
      assert.match(lookup.stdout, /ORDER_CREATED/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

function git(cwd: string, args: readonly string[]): void {
  execFileSync("git", ["-C", cwd, ...args], { stdio: "ignore" });
}

function commit(cwd: string, message: string): void {
  execFileSync(
    "git",
    ["-C", cwd, "-c", "user.email=reuse@example.com", "-c", "user.name=Reuse", "commit", "-m", message],
    { stdio: "ignore" },
  );
}

function runCli(args: readonly string[]): { readonly code: number; readonly stdout: string } {
  const result = spawnSync(process.execPath, ["dist/src/cli.js", "reuse", ...args], {
    encoding: "utf8",
  });
  return { code: result.status ?? 1, stdout: result.stdout };
}
