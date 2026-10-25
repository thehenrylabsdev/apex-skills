# Deterministic Engine Architecture (`docs/ARCHITECTURE.md`)

Unlike traditional Agent Skills repositories that rely solely on prose instructions, **`apex-skills`** pairs its 16-skill catalog with a zero-dependency, strictly typed TypeScript verification and runtime engine (`src/`).

```mermaid
classDiagram
    class MemoryLedgerEngine {
        +matchesScopePattern(filePath, scopePattern) boolean
        +parseMemoryPinEntries(markdownContent, sourceFile) MemoryPinEntry[]
        +evaluateMemoryEntries(entries, changedFilesBySha) MemoryAuditReport
        +auditRepositoryMemory(repoRoot, relativeFiles) MemoryAuditReport
    }

    class DisjointSeamAnalyzer {
        +seamsOverlap(seamA, seamB) boolean
        +findTaskSeamConflict(taskA, taskB) SeamConflict
        +scheduleDisjointWaves(tasks) WaveScheduleResult
        +simulateKvCacheEconomics(input) KvCacheSimulationComparison
    }

    class RuntimeGuards {
        +canonicalizeUrl(rawUrl) string
        +computePromptAwareCacheKey(input) string
        +extractImmutableSignatures(sourceCode) ImmutableBlockSignature[]
        +verifyImmutableBlocksUnchanged(beforeSource, afterSource) SignatureVerificationResult
    }

    class FourTierEvalEngine {
        +parseSkillDirectory(skillDirPath) SkillMetadata
        +discoverSkills(skillsRoot) SkillMetadata[]
        +scorePromptAgainstSkills(prompt, modelInvokedSkills) RankedSkill[]
        +validateSkillCatalog(skillsRoot, evalCases, tokenCeiling) CatalogValidationReport
    }

    FourTierEvalEngine --> DisjointSeamAnalyzer : uses for benchmark simulation
```

---

## 1. `MemoryLedgerEngine` (`src/memory-ledger.ts`)
Solves the **Cross-Session Memory Drift** problem acknowledged as unsolved across all prior skill frameworks:
- Parses `[sha:<commit_sha> | scope:<glob_list>]` claims from `DECISIONS.md` and `CONSTRAINTS.md`.
- Executes `git cat-file -e <sha>^{commit}` and `git diff --name-only <sha>..HEAD`.
- Matches modified files against `<glob_list>` (`matchesScopePattern`) and flags each claim as `VALID`, `DRIFTED` (with exact file names), or `UNVERIFIABLE_SHA`.

## 2. `DisjointSeamAnalyzer` (`src/seam-analyzer.ts`)
Prevents **Multi-Agent Delivery Race Conditions** (which caused a `-24%` accuracy drop on SWE-bench Verified):
- Accepts a DAG of `TaskNode` items with `dependsOn` and `touchedSeams`.
- Performs topological wave scheduling while checking `findTaskSeamConflict(taskA, taskB)`.
- If two ready tasks touch overlapping files or glob prefixes, they are automatically serialized into separate waves (`serializedConflicts`), guaranteeing $\text{Seams}_A \cap \text{Seams}_B = \emptyset$ inside every parallel worktree wave.

## 3. `RuntimeGuards` (`src/runtime-guards.ts`)
Replaces fragile bash hooks with deterministic, non-destructive cryptographic verification:
- **`computePromptAwareCacheKey`**: Hashes `canonicalUrl + "\0" + normalizedPrompt + "\0" + etag + "\0" + lastModified` via SHA-256 so two different extraction prompts against the same URL never poison each other's cache entry.
- **`verifyImmutableBlocksUnchanged`**: Extracts `@immutable-start ... @immutable-end` and `@simplify-ignore-start ... @simplify-ignore-end` blocks in memory and compares SHA-256 digests before and after edits—never mutating user files on disk during `PreToolUse`.

## 4. `FourTierEvalEngine` (`src/eval-engine.ts`)
Enforces 4 automated verification gates on every commit:
- **Tier 1 (Structure, Invocation Graph & Portability):** Checks YAML frontmatter, `agents/openai.yaml` policy parity, zero `../` links, valid `Skill` tool targets (`disableModelInvocation === false`), and mandatory `LEAF-AGENT GUARD` clauses.
- **Tier 2 (Token Budget Ratchets):** Enforces `<= 600` tokens total cold-start frontmatter and `<= 1,800` tokens per skill file.
- **Tier 3 (Namespace Collision & 24/24 Adversarial Routing):** Verifies zero collisions with built-in harness commands and `100%` Rank-1 routing accuracy on `evals/routing-benchmark.json`.
- **Tier 4 (`src/benchmark.ts`):** Computes reproducible cross-repository metrics across `LaurenTan`, `addyosmani`, `mattpocock`, and `apex-skills`.
