---
name: apex-setup
description: "Bootstrap or verify (--verify) a repository's Apex context pointers, GLOSSARY.md, CONSTRAINTS.md, and commit-pinned DECISIONS.md."
disable-model-invocation: true
---

# Apex Setup: Idempotent Repository Bootstrap & Verify Mode

Initialize or audit (`--verify`) the lightweight files that power Apex Skills while keeping always-loaded root context strictly under `< 600` tokens.

## Two Modes

### Mode A: `--verify` (Non-Destructive Drift & Budget Check)
When the user passes `--verify` or asks to check the current setup:
1. Do **not** modify any files.
2. Check that `AGENTS.md` / `CLAUDE.md` exists and contains concise navigation pointers (`< 600` tokens).
3. Check that `GLOSSARY.md`, `CONSTRAINTS.md`, and `DECISIONS.md` exist.
4. Run `npx apex-skills memory-audit` to verify all `[sha:<commit> | scope:<glob>]` entries in `DECISIONS.md` and `CONSTRAINTS.md` against `HEAD`.
5. Report pass/drift status.

### Mode B: Bootstrap / Update (Idempotent)
1. Inspect existing `AGENTS.md` / `CLAUDE.md` (edit the existing file; never create a duplicate if one already exists).
2. Seed `GLOSSARY.md` (Ubiquitous Language), `CONSTRAINTS.md` (Ratchets), and `DECISIONS.md` (Commit-Pinned Ledger) if missing.
3. Add a compact `## Apex Context Pointers` block (<= 15 lines) to `AGENTS.md` / `CLAUDE.md` pointing to those three files.
4. Run `npx apex-skills hooks install` so Claude Code and Cursor block the end of a turn until `npx apex-skills scan` prints `PASS`. Run `npx apex-skills hooks install --global` once on the machine so every later repository is covered before its own bootstrap.
