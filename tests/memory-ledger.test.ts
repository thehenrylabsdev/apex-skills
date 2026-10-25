import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluateMemoryEntries,
  matchesScopePattern,
  parseMemoryPinEntries,
} from "../src/memory-ledger.js";

void describe("MemoryLedgerEngine", () => {
  void it("matches exact files, directory prefixes, and glob patterns accurately", () => {
    assert.equal(
      matchesScopePattern("src/auth/jwt.ts", "src/auth/**"),
      true,
    );
    assert.equal(
      matchesScopePattern("src/auth/nested/token.ts", "src/auth/**"),
      true,
    );
    assert.equal(
      matchesScopePattern("src/billing/invoice.ts", "src/auth/**"),
      false,
    );
    assert.equal(
      matchesScopePattern("src/seam-analyzer.ts", "src/*.ts"),
      true,
    );
    assert.equal(
      matchesScopePattern("src/nested/seam.ts", "src/*.ts"),
      false,
    );
    assert.equal(
      matchesScopePattern("skills/apex-tdd/SKILL.md", "skills/apex-tdd"),
      true,
    );
  });

  void it("parses commit-pinned memory claims from DECISIONS.md format", () => {
    const markdown = [
      "# Architectural Decisions",
      "",
      "- [sha:a356c4b | scope:src/seam-analyzer.ts] Disjoint wave scheduling requires pairwise seam comparison.",
      "- [sha:8b25897 | scope:skills/**, src/eval-engine.ts] Model-invoked skills must remain under 600 tokens.",
      "- Regular bullet without a commit pin is ignored.",
    ].join("\n");

    const parsed = parseMemoryPinEntries(markdown, "DECISIONS.md");
    assert.equal(parsed.length, 2);
    const first = parsed[0];
    const second = parsed[1];
    assert.ok(first !== undefined);
    assert.ok(second !== undefined);
    assert.equal(first.commitSha, "a356c4b");
    assert.equal(first.scopePattern, "src/seam-analyzer.ts");
    assert.equal(first.line, 3);
    assert.equal(second.commitSha, "8b25897");
    assert.equal(second.scopePattern, "skills/**, src/eval-engine.ts");
  });

  void it("detects VALID, DRIFTED, and UNVERIFIABLE_SHA memory states deterministically", () => {
    const markdown = [
      "- [sha:1111111 | scope:src/auth/**] Auth uses stateless Ed25519 tokens.",
      "- [sha:2222222 | scope:src/payments/**] Payments retry idempotency keys up to 3 times.",
      "- [sha:9999999 | scope:src/legacy/**] Unknown SHA from squashed branch.",
    ].join("\n");

    const entries = parseMemoryPinEntries(markdown, "DECISIONS.md");
    const changedBySha = new Map<string, readonly string[] | null>([
      ["1111111", ["src/payments/stripe.ts", "README.md"]],
      ["2222222", ["src/payments/stripe.ts", "src/payments/webhook.ts"]],
      ["9999999", null],
    ]);

    const report = evaluateMemoryEntries(entries, changedBySha);
    assert.equal(report.totalEntries, 3);
    assert.equal(report.validCount, 1);
    assert.equal(report.driftedCount, 1);
    assert.equal(report.unverifiableCount, 1);
    const r0 = report.results[0];
    const r1 = report.results[1];
    const r2 = report.results[2];
    assert.ok(r0 !== undefined && r1 !== undefined && r2 !== undefined);
    assert.equal(r0.state, "VALID");
    assert.equal(r1.state, "DRIFTED");
    assert.deepEqual(r1.driftedFiles, [
      "src/payments/stripe.ts",
      "src/payments/webhook.ts",
    ]);
    assert.equal(r2.state, "UNVERIFIABLE_SHA");
  });
});
