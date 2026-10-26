## Summary

<!-- 1-2 sentences describing the change using GLOSSARY.md Ubiquitous Language -->

## 5-Gate Verification Checklist

- [ ] **Deletion Test Passed:** Every added skill instruction encodes a genuine Counter-Prior Delta (no generic pre-training prose).
- [ ] **Cold-Start Ratchet Passed (`<= 600` Tokens):** `npm run validate` confirms always-loaded frontmatter remains under the ceiling.
- [ ] **Standalone Portability (`0` `../` Escape Links):** Skill folders remain 100% self-contained for `npx skills@latest add --skill=<name>`.
- [ ] **Memory Ledger Audited:** `npm run memory-audit` reports `0 DRIFTED` entries in `DECISIONS.md` and `CONSTRAINTS.md`.
- [ ] **Full Quality Gate Green:** `npm run quality` (`eslint`, `tsc --noEmit`, unit tests, 32/32 routing evals, and the canonical reuse audit) passes with `0` errors and `0` warnings.
