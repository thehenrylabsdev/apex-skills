# Changelog

All notable changes to **`apex-skills`** are documented in this file.
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) and [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Added

- **Canonical Reuse Index (`apex-reuse` + `apex-skills reuse`):**
  - Model-invoked skill `apex-reuse` runs before a constant, domain literal, or method is added. The implementation calls the canonical symbol the audit names. `enum-fanout` adds the input type or enum as a parameter of that method.
  - `reuse audit --base <ref>` extracts Java, Kotlin, TypeScript, JavaScript, and Python symbols, hashes normalized method bodies, and fails on a new `SHADOW_CONSTANT`, `DUPLICATE_LITERAL`, or `NEAR_CLONE`.
  - A SQLite ledger at `.apex/reuse-index.sqlite` stores the index by file content hash. Embeddings, tree-sitter, and LSP stay off the verdict.
  - `apex-tdd`, `apex-verify`, `apex-spec`, `apex-waves`, `apex-router`, and `apex-ship` call the gate. Parallel waves put the shared canonical file in `touchedSeams`.
  - Cold-start frontmatter is `342` tokens (`1,365` bytes), still under the `600` token ceiling. Routing evals are `32 / 32`.

---

## [1.2.0] - 2026-10-26

### Added

- **Release-Channel Selection (`apex-versions` + `apex-skills versions`):**
  - Model-invoked skill `apex-versions` selects the current LTS release when one is still supported, otherwise the newest stable release, before scaffolding a stack or adding a dependency.
  - Explicit user versions are pins. Versions already in the manifest stay unchanged unless the user asks to add, replace, or upgrade them.
  - `versions resolve` reads a SQLite ledger first. A record younger than one observed stable release cycle is reused. A missing or cadence-expired record is refreshed via the ecosystem package manager or registry (`npm`, Maven Central, PyPI, crates.io, Go, the Node.js index, Adoptium, the Rust stable channel).
  - Host toolchain constraints (`--host`) walk back to the newest stable release whose declared peers, engines, and developed-against ranges accept the language and framework already chosen.
  - A web search runs only when the resolver returns `needs-websearch`. `versions record` persists that result until the next release cycle.
  - Cold-start frontmatter is `299` tokens (`1,195` bytes), still under the `600` token ceiling. Routing evals are `28 / 28`.

---

## [1.1.0] - 2026-10-25

### Added

- **Multi-Platform Enterprise Reference Architecture (`examples/apex-ledger/`):**
  - **Canonical Cross-Layer Contract Suite (`examples/apex-ledger/contracts/`):** Added `openapi-v1.json` (OpenAPI 3.1.0) and 6 Golden JSON Wire Fixtures (`campaigns-response.json`, `reservation-created.json`, `order-confirmed-settled.json`, `ledger-summary.json`, `problem-out-of-stock.json`, and `forward-compatible-v2-order.json`) verified across Backend, Web, KMP, Android, and iOS.
  - **Enterprise Backend (`examples/apex-ledger/backend/`):** Implemented with **Java 25 LTS**, **Spring Boot `4.1.2`**, **Spring Modulith `2.1.2`**, **Gradle `9.7.1`**, PostgreSQL, Apache Kafka, Redis, Lombok, MapStruct, ArchUnit, JUnit 5, Mockito, Testcontainers, SpringDoc OpenAPI, JaCoCo, and 3 environment profiles (`application-local.yml`, `application-dev.yml`, `application-prod.yml`).
  - **Shared Mobile Core (`examples/apex-ledger/shared-kmp/`):** Implemented with **Kotlin `2.4.0` Multiplatform**, `AppEnvironment` (`LOCAL`, `DEV`, `PROD`), forward-compatible `@Serializable` wire models (`ignoreUnknownKeys = true`), and deterministic `CheckoutStatechart`.
  - **Android Native App (`examples/apex-ledger/android-app/`):** Implemented with **Kotlin `2.4.0`**, Jetpack Compose, Jetpack Navigation 3 backstack keys, Adaptive Edge-to-Edge semantics, and `:shared-kmp` composite integration.
  - **iOS Native App (`examples/apex-ledger/ios-app/`):** Implemented with **Swift `6.4`** (`StrictConcurrency`), SwiftUI, SF Symbols, Dynamic Type, and native `swift test` contract & statechart verification.
  - **Web Storefront & SRE Command Center (`examples/apex-ledger/web-app/`):** Implemented with **Next.js `16.4.3`** (Turbopack), **React `19.3.1`**, TypeScript Strict, `lucide-react`, 3 environment profiles (`.env.local`, `.env.development`, `.env.production`), and WCAG 2.2 AA compliance.
- **Standardized Design System (`DESIGNS.md`) & Case Study (`docs/CASE-STUDY-APEX-LEDGER.md`):**
  - Authored `DESIGNS.md` validated with `@google/design.md` and `verify-wcag.sh`, plus `docs/CASE-STUDY-APEX-LEDGER.md` documenting the full `apex-skills` lifecycle.

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
