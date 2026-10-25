# Contributing to `apex-skills`

Every contribution to `apex-skills` is held to deterministic engineering standards rather than subjective prose preferences.

---

## 1. The 5 Non-Negotiable Invariants

Before opening a Pull Request that modifies or adds a skill or engine module, verify all five invariants:

1. **The Behavioral Deletion Test (No "Prompt Lore"):**
   - Every line in a `SKILL.md` must encode a **Counter-Prior Delta** (a behavior frontier models systematically get wrong without intervention).
   - If deleting a paragraph does not change agent behavior because frontier models already know it from pre-training, delete it.
2. **Global Cold-Start Ceiling (`<= 600` Tokens):**
   - Model-invoked skills inject their frontmatter into every turn of every session. Adding or editing a model-invoked skill must keep total frontmatter across the catalog strictly `<= 600` tokens (`2,400` bytes).
   - Workflow/orchestration skills must set `disable-model-invocation: true` in `SKILL.md` and `policy.allow_implicit_invocation: false` in `agents/openai.yaml`.
3. **100% Standalone Portability (Zero `../` Escape Links):**
   - Every skill folder (`skills/<name>/`) must be self-contained so `npx skills@latest add thehenrylabsdev/apex-skills --skill=<name>` succeeds without broken links.
4. **Cross-Skill Invocation & Subagent Leaf Guards:**
   - `Call the Skill tool with "<name>"` may only target a **model-invoked** skill.
   - Any skill that dispatches subagents must include an explicit `LEAF-AGENT GUARD` prohibiting recursive skill calls or nested subagent spawning.
5. **Commit-Pinned Memory Updates:**
   - When modifying files governed by `DECISIONS.md` or `CONSTRAINTS.md`, run `npm run memory-audit` and update the `[sha:<commit> | scope:<glob>]` pin after verifying the invariant still holds.

---

## 2. Verification Workflow

Run the unified quality gate locally before submitting a PR:

```bash
npm run quality
```

This executes:
1. `npx eslint . --max-warnings 0` (ESLint v10 `strictTypeChecked`)
2. `npx tsc --noEmit` (TypeScript strictest compiler settings)
3. `npm test` (Automated unit and integration suite)
4. `npm run validate` (4-Tier Skill Catalog & 24/24 Routing Eval Validator)

---

## 3. Conventional Commit & Changelog Discipline

- Follow **Conventional Commits** (`feat(skills): ...`, `feat(engine): ...`, `fix(validator): ...`, `docs(benchmark): ...`, `test(evals): ...`).
- Document all user-visible skill or CLI changes under the `[Unreleased]` section of [CHANGELOG.md](./CHANGELOG.md).
