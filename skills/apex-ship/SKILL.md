---
name: apex-ship
description: "Execute pre-flight release verification, audit security/perf/memory gates, classify blast radius, and generate a visual PR summary."
disable-model-invocation: true
---

# Apex Ship: Pre-Flight Release Gate & Visual PR Close-Out

Run the final production readiness verification and produce a high-signal Pull Request summary with explicit **Merge-Danger / Blast-Radius** classification.

## Pre-Flight Checklist (Mandatory Before Opening PR)

1. **Deterministic Quality Gate:** Run the repo's full linter, typechecker (`tsc --noEmit`), and automated test suite; require **0 errors and 0 warnings**.
2. **Memory & Constraint Audit:** Call the Skill tool with `apex-memory` (or run `npx apex-skills memory-audit`) to confirm `CONSTRAINTS.md` ratchets and `DECISIONS.md` commit pins are up to date.
3. **Two-Axis & Production Guard:** Call the Skill tool with `apex-verify` and `apex-guard` (`LEAF-AGENT GUARD` enforced on all review subagents) to confirm Spec compliance, Standards adherence, OWASP security, and CWV/WCAG thresholds.
4. **Canonical Reuse Gate:** Run `npx apex-skills reuse audit --base <release-base>`. `SHADOW_CONSTANT`, `DUPLICATE_LITERAL`, and `NEAR_CLONE` block the release. Call the Skill tool with `apex-reuse` to repair each finding.

## Visual PR Body Template

```markdown
## Summary
[1-2 sentence executive summary using `GLOSSARY.md` Ubiquitous Language]

## Architecture / Flow Visual
[Smallest Mermaid diagram, call tree, or signature diff that makes the change self-evident]

## Verification Evidence
- Tests & Ratchets: [Exact command + pass count]
- Memory Ledger Audit: [VALID / updated pins]
- Canonical Reuse Audit: [clean / findings repaired]
- Security / Perf / A11y Gate: [Passed checks]

## Merge Danger & Rollback Plan
- **Door Type:** [Two-Way Door (instant revert) | One-Way Door (schema/data migration)]
- **Blast Radius:** [Affected public seams and rollback command]
```
