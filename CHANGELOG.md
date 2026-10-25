# Changelog

All notable changes to **`apex-skills`** are documented in this file.
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) and [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [1.0.0] - 2026-10-25

### Added

- **Dual-Budget 16-Skill Catalog (`skills/`):**
  - **6 Model-Invoked Core Skills (`256` tokens total cold-start frontmatter, `< 600` token ceiling):**
    - `apex-grill`: Bounded frontier design-tree interrogation (max 4 highest-epistemic-gain questions per round) with default-yes (`➡️`) recommendations and inline `GLOSSARY.md` Ubiquitous Language updates.
    - `apex-tdd`: Heterodox seam-based TDD with vertical tracer bullets, Ousterhout deep modules, zero mid-loop refactoring, and `CONSTRAINTS.md` ratchet verification.
    - `apex-diagnose`: Red-loop first debugging and performance diagnosis with mandatory `<REDACTED>` secret scrubbing, load-bearing repro minimization, and 3-5 falsifiable hypotheses.
    - `apex-verify`: Doubt-Driven two-axis verification (`ARTIFACT + CONTRACT` with producer `CLAIM` hidden) across Spec and Standards axes, protected by a mandatory `LEAF-AGENT GUARD` against $2^N$ subagent recursion.
    - `apex-guard`: Self-contained OWASP Top 10 security, Core Web Vitals / N+1 database performance, and WCAG 2.2 AA accessibility gate with zero external `../` relative links.
    - `apex-memory`: Cross-session semantic memory ledger coordinating `GLOSSARY.md`, `CONSTRAINTS.md`, and commit-pinned `DECISIONS.md`.
  - **10 User-Invoked Workflow & Orchestration Skills (`0` cold-start token tax via `disable-model-invocation: true` and `allow_implicit_invocation: false`):**
    - `/apex-router`, `/apex-wayfinder`, `/apex-spec`, `/apex-waves`, `/apex-arena`, `/apex-statechart`, `/apex-ship`, `/apex-retro`, `/apex-handoff`, `/apex-setup` (including non-destructive `--verify` drift detection mode).
- **Deterministic TypeScript Verification & Context Engine (`src/`):**
  - `MemoryLedgerEngine` (`src/memory-ledger.ts`): Parses `[sha:<commit> | scope:<glob>]` pins in `DECISIONS.md` and `CONSTRAINTS.md` and executes `git diff --name-only <sha>..HEAD` to detect `VALID`, `DRIFTED`, and `UNVERIFIABLE_SHA` claims.
  - `DisjointSeamAnalyzer` (`src/seam-analyzer.ts`): Schedules task DAGs into mathematically disjoint worktree execution waves ($\text{Seams}_A \cap \text{Seams}_B = \emptyset$) and models KV-Cache warm reuse economics.
  - `RuntimeGuards` (`src/runtime-guards.ts`): Implements `computePromptAwareCacheKey` (`sha256(canonicalUrl + normalizedPrompt + etag + lastModified)`) to prevent semantic cache poisoning and `verifyImmutableBlocksUnchanged` for non-destructive out-of-band `@immutable` / `@simplify-ignore` block verification.
  - `FourTierEvalEngine` & `CrossRepoBenchmark` (`src/eval-engine.ts`, `src/benchmark.ts`): Enforces Tier 1 structural/portability invariants, Tier 2 cold-start & per-skill token budgets, Tier 3 namespace collision & 24/24 routing evaluation, and Tier 4 cross-repo empirical benchmarking.
- **Universal Multi-Harness Packaging:**
  - Added `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `.codex-plugin/plugin.json`, `.cursor-plugin/plugin.json`, `gemini-extension.json`, `plugin.json`, and per-skill `agents/openai.yaml`.
- **Comprehensive Documentation & Empirical Reports (`docs/`):**
  - Added `docs/CRITIQUE-AND-ORIGINS.md`, `docs/BENCHMARK-REPORT.md`, `docs/ARCHITECTURE.md`, `docs/INSTALLATION.md`, `docs/SKILL-ANATOMY.md`, and `docs/ROADMAP.md`.
