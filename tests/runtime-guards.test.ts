import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canonicalizeUrl,
  computePromptAwareCacheKey,
  extractImmutableSignatures,
  verifyImmutableBlocksUnchanged,
} from "../src/runtime-guards.js";

void describe("RuntimeGuards", () => {
  void it("prevents semantic cache poisoning by binding URL, normalized prompt, and ETag", () => {
    const url = "https://docs.example.com/api?b=2&a=1#section";
    assert.equal(
      canonicalizeUrl(url),
      "https://docs.example.com/api?a=1&b=2",
    );

    const keySummary = computePromptAwareCacheKey({
      url,
      prompt: "Summarize the authentication headers",
      etag: 'W/"v1"',
    });
    const keyPricing = computePromptAwareCacheKey({
      url,
      prompt: "Extract the rate limit tiers table",
      etag: 'W/"v1"',
    });
    const keyNewEtag = computePromptAwareCacheKey({
      url,
      prompt: "Summarize the authentication headers",
      etag: 'W/"v2"',
    });

    assert.notEqual(keySummary, keyPricing);
    assert.notEqual(keySummary, keyNewEtag);
  });

  void it("verifies @immutable and @simplify-ignore blocks out-of-band without mutating disk files", () => {
    const original = [
      "export function calculateTax(amount: number): number {",
      "  // @immutable-start tax-core",
      "  const rate = 0.0825;",
      "  const base = Math.round(amount * rate);",
      "  // @immutable-end",
      "  return base;",
      "}",
    ].join("\n");

    const safeEdit = [
      "export function calculateTax(amount: number): number {",
      "  if (amount <= 0) return 0;",
      "  // @immutable-start tax-core",
      "  const rate = 0.0825;",
      "  const base = Math.round(amount * rate);",
      "  // @immutable-end",
      "  return base;",
      "}",
    ].join("\n");

    const tamperedEdit = [
      "export function calculateTax(amount: number): number {",
      "  // @immutable-start tax-core",
      "  const rate = 0.08;",
      "  const base = Math.round(amount * rate);",
      "  // @immutable-end",
      "  return base;",
      "}",
    ].join("\n");

    const sigs = extractImmutableSignatures(original);
    assert.equal(sigs.length, 1);
    const firstSig = sigs[0];
    assert.ok(firstSig !== undefined);
    assert.equal(firstSig.blockId, "tax-core");

    const safeRes = verifyImmutableBlocksUnchanged(original, safeEdit);
    assert.equal(safeRes.valid, true);
    assert.equal(safeRes.violatedBlocks.length, 0);

    const tamperedRes = verifyImmutableBlocksUnchanged(original, tamperedEdit);
    assert.equal(tamperedRes.valid, false);
    assert.deepEqual(tamperedRes.violatedBlocks, ["tax-core"]);
  });
});
