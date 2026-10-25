# Agent Steering & Navigation Pointers

Keep this file under `< 350` tokens. Do not copy directory trees or `package.json` scripts here; inspect the environment directly.

## Apex Context Pointers
- **Domain Vocabulary (Ubiquitous Language):** Read [GLOSSARY.md](./GLOSSARY.md) before designing, naming symbols, or grilling.
- **Active Ratchets & Hard Floors:** Read [CONSTRAINTS.md](./CONSTRAINTS.md) before modifying skills, TypeScript code, or tests.
- **Commit-Pinned Architectural Memory:** Read [DECISIONS.md](./DECISIONS.md) and run `npm run memory-audit` to check whether any governed scope has drifted since its pinned commit SHA.
- **Workflow Router:** If unsure which skill or Smart-Zone phase boundary applies, tell the user to run `/apex-router`.

## Non-Negotiable Engineering Rules
1. **Zero Suppressions:** Never use `any`, `@ts-ignore`, `@ts-expect-error`, or `eslint-disable`. Fix root causes cleanly.
2. **Skill Invocation Invariant:** Only model-invoked skills (`apex-grill`, `apex-tdd`, `apex-diagnose`, `apex-verify`, `apex-guard`, `apex-memory`) may be called via `Call the Skill tool with "<name>"`. Never call user-invoked (`disable-model-invocation: true`) skills via the Skill tool.
3. **Quality Gate:** Run `npm run quality` (`eslint`, `tsc --noEmit`, unit tests, and 4-tier skill validator) before completing any change.
