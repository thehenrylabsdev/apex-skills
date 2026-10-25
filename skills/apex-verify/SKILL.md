---
name: apex-verify
description: "Review a git diff, pull request, or branch before merge across Spec compliance and Coding Standards using Doubt-Driven verification."
---

# Apex Verify: Doubt-Driven Two-Axis Leaf Verification

Review changes between `HEAD` and a base ref (`git diff <base>...HEAD`) across two independent axes (**Spec Axis** and **Standards Axis**) while stripping the producer's self-reported success claim.

## Counter-Prior Rules

1. **Doubt-Driven Handoff (Pass `ARTIFACT + CONTRACT`, Hide `CLAIM`):** When dispatching verification subagents, pass only the raw diff (`ARTIFACT`) and the originating spec/standards (`CONTRACT`). Never pass the implementer's narrative summary ("all requirements implemented cleanly") so reviewers cannot anchor on producer bias.
2. **LEAF-AGENT GUARD (Mandatory Anti-Recursion Lock):** Every spawned reviewer subagent prompt **must** begin with:
   > *"LEAF-AGENT GUARD: You are a terminal Depth-1 leaf reviewer. Do not invoke any Skill tool (`apex-verify` or others) and do not spawn subagents."*
3. **Out-of-Band Immutable Block Check:** Verify that any `@immutable-start ... @immutable-end` or `@simplify-ignore-start ... @simplify-ignore-end` blocks remain byte-for-byte identical without mutating source files on disk.

## Process

### 1. Pin Base Ref & Collect Contract
1. Resolve `<base>` (`git rev-parse <base>`) and verify `git diff <base>...HEAD` is non-empty.
2. Locate the spec/ticket contract and repo standards (`CODING_STANDARDS.md`, `CONSTRAINTS.md`, `GLOSSARY.md`).

### 2. Dispatch Two Parallel Depth-1 Leaf Subagents
- **Subagent A (Spec & Contract Axis):** Reports missing or partial requirements, unrequested scope creep, and subtle behavioral mismatches against the spec. Quotes exact spec lines.
- **Subagent B (Standards & Architecture Axis):** Checks repo conventions, `CONSTRAINTS.md` ratchets, Ousterhout module depth, and Fowler structural smells (Feature Envy, Shotgun Surgery, Primitive Obsession, Speculative Generality, Data Clumps). Skips anything enforced by deterministic linters.

### 3. Side-by-Side Unmerged Verdict
Report `## Spec Axis` and `## Standards Axis` separately so passing one axis never masks a failure on the other.
