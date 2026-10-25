---
name: apex-memory
description: "Maintain GLOSSARY.md domain terminology, CONSTRAINTS.md ratchets, and commit-pinned DECISIONS.md architectural memory across sessions."
---

# Apex Memory: Commit-Pinned Semantic Ledger & Ubiquitous Language

Solve cross-session context drift by binding domain vocabulary and architectural invariants to verifiable Git commit SHAs and file-scope globs.

## Three Durable Artifacts

1. **`GLOSSARY.md` (Ubiquitous Language):**
   - Defines domain concepts (**What & Why** only).
   - **Never include file paths or line numbers** in `GLOSSARY.md` so domain definitions remain valid across refactors.
2. **`CONSTRAINTS.md` (Monotonic Ratchets & Hard Floors):**
   - Records measurable floors/ceilings (e.g., Cold-Start Token Budget `<= 600` tokens, test count `>= N`, zero `any` suppressions).
   - When a metric improves, ratchet the threshold tighter in the same commit.
3. **`DECISIONS.md` (Commit-Pinned Architectural Claims):**
   - Every architectural invariant that depends on code structure **must** carry a machine-verifiable pin:
     ```markdown
     - [sha:<7-40-char-git-sha> | scope:<path-or-glob>] <Concise architectural claim and rationale>
     ```

## Drift Verification Loop

1. **Before trusting prior session claims:** Run `npx apex-skills memory-audit` (or `git diff --name-only <sha>..HEAD -- <scope>`).
2. **When `memory-audit` reports `DRIFTED`:** Inspect the modified files in `<scope>`, verify whether the invariant still holds, and either update the claim with the new `HEAD` SHA or supersede it.
3. **After landing an architectural change:** Obtain `git rev-parse --short HEAD` and record the new commit-pinned entry in `DECISIONS.md` or `CONSTRAINTS.md`.
