# Active Constraints & Monotonic Ratchets

Every threshold in this file is enforced by `npm run quality` (`scripts/check-code-quality.sh`). When a metric improves, ratchet the bound tighter in the same commit.

## 1. Context & Token Economy Ratchets
- [sha:becb3f7 | scope:skills/**] **Global Cold-Start Token Ceiling:** Always-loaded frontmatter across all model-invoked skills must remain strictly `<= 600` tokens (currently `299` tokens / `1,195` bytes).
- [sha:becb3f7 | scope:skills/**] **Per-Skill Smart-Zone Ceiling:** Every individual `SKILL.md` file must remain strictly `<= 1,800` tokens.
- [sha:becb3f7 | scope:skills/**] **Standalone Portability Floor:** `0` relative links or backtick paths escaping a skill folder (`../`), ensuring `npx skills@latest add --skill=<name>` works standalone.

## 2. Subagent & Routing Safety Floors
- [sha:8106e40 | scope:src/eval-engine.ts] **Zero Harness Built-In Collisions:** `0` skill names colliding with built-in commands of Claude Code, Codex, Copilot, Cursor, or Devin.
- [sha:becb3f7 | scope:skills/**] **Mandatory Depth-1 Leaf Guard:** `100%` of model-invoked skills that mention subagents must contain an explicit `LEAF-AGENT GUARD` clause.
- [sha:becb3f7 | scope:evals/routing-benchmark.json] **Routing Eval Pass Floor:** `28 / 28` (`100%`) Rank-1 accuracy across natural, understated, and adversarial prompts.

## 3. Code Quality & Security Ratchets
- [sha:a356c4b | scope:tsconfig.json] **Compiler & Linter Strictness:** `0` errors and `0` warnings under ESLint v10 `strictTypeChecked` and TypeScript `strict: true`, `noImplicitAny`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`.
- [sha:977c4f9 | scope:package.json] **Supply-Chain Vulnerability Floor:** `0` vulnerabilities reported by `npm audit` and `0` runtime npm dependencies.
- [sha:4944f5d | scope:examples/apex-ledger/contracts/**, DESIGNS.md] **Cross-Layer Contract & WCAG 2.2 AA Floor:** `100%` of wire fixtures (`v1` and forward-compatible `v2`) must pass Backend Producer, Web Consumer, KMP Consumer, and iOS Swift 6.4 Consumer contract tests alongside `0` WCAG 2.2 AA errors.
