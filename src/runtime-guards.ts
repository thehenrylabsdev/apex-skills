import { createHash } from "node:crypto";
import type {
  ImmutableBlockSignature,
  PromptCacheKeyInput,
  SignatureVerificationResult,
} from "./types.js";

/**
 * Canonicalizes a URL by stripping hash fragments and sorting query parameters.
 */
export function canonicalizeUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  try {
    const parsed = new URL(trimmed);
    parsed.hash = "";
    parsed.searchParams.sort();
    return parsed.toString();
  } catch {
    return trimmed;
  }
}

/**
 * Computes a collision-resistant, prompt-aware cache key for URL + Prompt + HTTP validators.
 * Fixes Addy Osmani's `sdd-cache` Semantic Cache Poisoning vulnerability where `sha256(url)`
 * ignored the extraction prompt and returned stale answers for different questions on the same URL.
 */
export function computePromptAwareCacheKey(input: PromptCacheKeyInput): string {
  const normUrl = canonicalizeUrl(input.url);
  const normPrompt = input.prompt.trim().replace(/\s+/g, " ").toLowerCase();
  const normEtag = (input.etag ?? "").trim();
  const normLastModified = (input.lastModified ?? "").trim();

  const payload = [normUrl, normPrompt, normEtag, normLastModified].join("\0");
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

const START_MARKER_REGEX =
  /@(?:immutable-start|simplify-ignore-start)(?:\s+([a-zA-Z0-9_-]+))?/;
const END_MARKER_REGEX = /@(?:immutable-end|simplify-ignore-end)/;

/**
 * Extracts protected `@immutable-start ... @immutable-end` or `@simplify-ignore-start ... @simplify-ignore-end`
 * blocks in-memory and computes their SHA-256 signatures WITHOUT mutating the source file on disk.
 * Fixes Addy Osmani's `simplify-ignore.sh` in-place disk mutation race condition.
 */
export function extractImmutableSignatures(
  sourceCode: string,
): readonly ImmutableBlockSignature[] {
  const lines = sourceCode.split(/\r?\n/);
  const signatures: ImmutableBlockSignature[] = [];

  let activeBlockId: string | null = null;
  let activeStartLine = 0;
  let buffer: string[] = [];
  let autoIndex = 1;

  for (let idx = 0; idx < lines.length; idx += 1) {
    const line = lines[idx] ?? "";
    const lineNum = idx + 1;
    if (activeBlockId === null) {
      const startMatch = START_MARKER_REGEX.exec(line);
      if (startMatch) {
        activeBlockId = startMatch[1] ?? `block-${autoIndex}`;
        autoIndex += 1;
        activeStartLine = lineNum;
        buffer = [line];
      }
      continue;
    }

    buffer.push(line);
    if (END_MARKER_REGEX.test(line)) {
      const rawContent = buffer.join("\n");
      const sha256 = createHash("sha256")
        .update(rawContent, "utf8")
        .digest("hex");
      signatures.push({
        blockId: activeBlockId,
        startLine: activeStartLine,
        endLine: lineNum,
        sha256,
        rawContent,
      });
      activeBlockId = null;
      buffer = [];
    }
  }

  if (activeBlockId !== null) {
    throw new Error(
      `Unclosed @immutable-start / @simplify-ignore-start block "${activeBlockId}" starting at line ${activeStartLine}`,
    );
  }

  return signatures;
}

/**
 * Verifies out-of-band that all protected blocks from `beforeSource` remain byte-for-byte identical in `afterSource`.
 */
export function verifyImmutableBlocksUnchanged(
  beforeSource: string,
  afterSource: string,
): SignatureVerificationResult {
  const beforeSigs = extractImmutableSignatures(beforeSource);
  const afterSigs = extractImmutableSignatures(afterSource);

  const afterById = new Map<string, ImmutableBlockSignature>();
  for (const sig of afterSigs) {
    afterById.set(sig.blockId, sig);
  }

  const violatedBlocks: string[] = [];
  const missingBlocks: string[] = [];

  for (const beforeSig of beforeSigs) {
    const matchingAfter = afterById.get(beforeSig.blockId);
    if (!matchingAfter) {
      missingBlocks.push(beforeSig.blockId);
      continue;
    }
    if (matchingAfter.sha256 !== beforeSig.sha256) {
      violatedBlocks.push(beforeSig.blockId);
    }
  }

  return {
    valid: violatedBlocks.length === 0 && missingBlocks.length === 0,
    violatedBlocks,
    missingBlocks,
  };
}
