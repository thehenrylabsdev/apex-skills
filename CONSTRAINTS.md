# Active Constraints & Monotonic Ratchets

Every threshold in this file is enforced by `npm run quality` (`scripts/check-code-quality.sh`). When a metric improves, ratchet the bound tighter in the same commit.

## 1. Context & Token Economy Ratchets
- [sha:664d81c | scope:skills/**] **Global Cold-Start Token Ceiling:** Always-loaded frontmatter across all model-invoked skills must remain strictly `<= 600` tokens (currently `342` tokens / `1,365` bytes).
- [sha:664d81c | scope:skills/**] **Per-Skill Smart-Zone Ceiling:** Every individual `SKILL.md` file must remain strictly `<= 1,800` tokens.
- [sha:664d81c | scope:skills/**] **Standalone Portability Floor:** `0` relative links or backtick paths escaping a skill folder (`../`), ensuring `npx skills@latest add --skill=<name>` works standalone.

## 2. Subagent & Routing Safety Floors
- [sha:8106e40 | scope:src/eval-engine.ts] **Zero Harness Built-In Collisions:** `0` skill names colliding with built-in commands of Claude Code, Codex, Copilot, Cursor, or Devin.
- [sha:664d81c | scope:skills/**] **Mandatory Depth-1 Leaf Guard:** `100%` of model-invoked skills that mention subagents must contain an explicit `LEAF-AGENT GUARD` clause.
- [sha:8f96753 | scope:evals/routing-benchmark.json] **Routing Eval Pass Floor:** `32 / 32` (`100%`) Rank-1 accuracy across natural, understated, and adversarial prompts.

## 3. Code Quality & Security Ratchets
- [sha:a356c4b | scope:tsconfig.json] **Compiler & Linter Strictness:** `0` errors and `0` warnings under ESLint v10 `strictTypeChecked` and TypeScript `strict: true`, `noImplicitAny`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`.
- [sha:f170a1a | scope:package.json] **Supply-Chain Vulnerability Floor:** `0` vulnerabilities reported by `npm audit` and `0` runtime npm dependencies.
- [sha:4944f5d | scope:examples/apex-ledger/contracts/**, DESIGNS.md] **Cross-Layer Contract & WCAG 2.2 AA Floor:** `100%` of wire fixtures (`v1` and forward-compatible `v2`) must pass Backend Producer, Web Consumer, KMP Consumer, and iOS Swift 6.4 Consumer contract tests alongside `0` WCAG 2.2 AA errors.

## 4. Canonical Reuse Floor
- [sha:664d81c | scope:src/reuse-model.ts, src/reuse-extract.ts, src/reuse-audit.ts, src/reuse-ledger.ts, src/reuse-scan.ts, src/reuse-cli.ts, src/cli.ts, scripts/check-code-quality.sh, .github/workflows/ci.yml, skills/apex-reuse/**] **Canonical Reuse Floor:** `0` new `SHADOW_CONSTANT`, `DUPLICATE_LITERAL`, or `NEAR_CLONE` findings against the merge-base. A same-body method enters the floor at `12` normalized tokens and `2` significant tokens. Enum fan-out enters at `8` normalized tokens. A raw-to-raw literal matches only a dotted domain code of length `>= 12`.

## 5. Project Scan Floor
- [sha:664d81c | scope:src/json-record.ts, src/scan-model.ts, src/scan-secrets.ts, src/scan-security.ts, src/scan-clones.ts, src/scan-diff.ts, src/scan-cve.ts, src/scan-adapters.ts, src/scan-hooks.ts, src/scan-run.ts, src/scan-cli.ts, src/cli.ts, scripts/check-code-quality.sh, .github/workflows/ci.yml, hooks/apex-scan.sh, .claude/settings.json, .cursor/hooks.json, skills/apex-guard/**, skills/apex-setup/**, skills/apex-ship/**] **Project Scan Floor:** `0` credential findings, `0` dangerous-sink findings, `0` copied token blocks, and `0` canonical-reuse findings in the diff. `0` high or critical npm advisories on a changed npm manifest, and `0` OSV ids on a changed parsed lockfile. An unlocked manifest in the diff fails until a lockfile exists. An opted-in `sonar-scanner` or `gitleaks` adapter fails closed when its binary is missing or its command exits non-zero.
