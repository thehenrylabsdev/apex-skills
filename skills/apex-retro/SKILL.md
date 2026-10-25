---
name: apex-retro
description: "Conduct a session retrospective to upgrade deterministic guardrails, prune no-op instructions, and optimize agent token economy."
disable-model-invocation: true
---

# Apex Retro: Pit-of-Success Environment & Token Economy Retrospective

Improve the **environment** so future agent sessions succeed faster with fewer tokens.

## 5 Audit Categories

1. **Mechanical Rule -> Deterministic Check (Highest Priority):**
   - Did the agent or reviewer catch a syntactic, import, formatting, or file-location mistake?
   - **Rule:** Never write prose in `AGENTS.md` or `CODING_STANDARDS.md` for a mechanical rule. Convert it into an ESLint/Ruff/Clippy rule, a type constraint, or a `CONSTRAINTS.md` CI test.
2. **Deletion Test & No-Op Pruning (`AGENTS.md` / `CLAUDE.md`):**
   - Inspect root context files. Remove any line that restates directory trees, `package.json` scripts, or standard pre-training knowledge (ETH Zurich benchmark rule: keep root context strictly `< 600` tokens of navigation pointers and counter-prior constraints).
3. **Navigation Pointers & Ubiquitous Language:**
   - Where did the agent waste turns searching for files or misinterpreting domain terms? Update `GLOSSARY.md` or add a 1-line pointer in `AGENTS.md`.
4. **Cross-Session Memory Pinning:**
   - Pin newly discovered architectural invariants in `DECISIONS.md` with `[sha:<commit> | scope:<glob>]`.
5. **Tool & KV-Cache Economy:**
   - Identify any cold subagent spawns or redundant full-file reads that could be replaced by warm context reuse or targeted grep.
