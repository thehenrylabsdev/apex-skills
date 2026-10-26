# Glossary (Ubiquitous Language)

This dictionary defines the core domain concepts of **Apex Skills** (**What & Why** only; zero file paths so definitions never go stale across refactors).

- **Cold-Start Token Tax:** The static payload of skill descriptions and session-start hooks injected into the model's context window at Turn 0 before the user types a single word.
- **Smart Zone (< 150k Tokens):** The effective context window ceiling within which frontier reasoning models maintain peak instruction adherence and multi-hop reasoning accuracy without context dilution.
- **Counter-Prior Delta:** Instructions that override a frontier model's default failure habits (e.g., hypothesizing before building a failing repro loop, refactoring inside a Red-Green TDD cycle, or asking 1 question per turn).
- **Deletion Test (Behavioral Ablation):** The authoring filter whereby any sentence in a skill that a frontier model already performs natively from pre-training is deleted as no-op bloat.
- **Bounded Frontier Grilling:** Walking the unblocked frontier of a Requirement Design Tree in batches of at most **4 highest-epistemic-gain questions per round**, each paired with a default `"yes"` recommendation (`➡️`).
- **Public Seam:** An explicit module boundary or public interface where behavior can be tested or swapped without coupling to internal implementation details (Michael Feathers / John Ousterhout).
- **Deep Module:** A module whose public interface is narrow and simple compared to the depth of functionality it encapsulates, minimizing cognitive and context load.
- **Doubt-Driven Handoff:** Passing only `ARTIFACT + CONTRACT` to a verification agent while withholding the producer agent's self-reported `CLAIM` of success to prevent confirmation bias.
- **Depth-1 Leaf Guard:** A hard instruction lock (`LEAF-AGENT GUARD`) injected into subagent prompts prohibiting recursive `Skill` calls or nested subagent spawning.
- **Disjoint-Seam Wave:** A parallel execution batch of tasks mathematically verified to touch non-overlapping file/seam scopes ($\text{Seams}_A \cap \text{Seams}_B = \emptyset$), eliminating multi-agent delivery race conditions.
- **Warm KV-Cache Reuse:** Routing review feedback back to the existing implementer context that already holds the codebase prefix in its KV-Cache rather than spawning a cold subagent from scratch.
- **Commit-Pinned Memory Ledger:** Cross-session architectural claims in `DECISIONS.md` and `CONSTRAINTS.md` bound to `[sha:<commit> | scope:<glob>]` so `git diff` deterministically flags stale memory (`DRIFTED`) when underlying code changes.
- **Release Channel:** The publication line used for a new install: the newest long-term-support release whose support window is still open, otherwise the newest stable release.
- **Version Ledger:** A local record of a package's release channel, publish cadence, support window, and declared host constraints, reused until one observed stable release cycle has elapsed.
- **Cadence Expiry:** The moment a ledger entry is at least one observed stable release interval old. The entry is refreshed from the package manager or registry before it is trusted again.
- **Explicit Version Pin:** A version the user named in the request. It is installed as written, ahead of release-channel selection.
- **Manifest Hold:** A version already recorded in the project manifest. It stays unchanged unless the user asks to add, replace, or upgrade that package.
- **Host Compatibility:** A candidate release is admissible when every declared peer, engine, and developed-against constraint accepts the language and framework versions already chosen. A host the package does not mention is unconstrained.
- **Canonical Reuse Index:** A per-repository SQLite ledger of string constants and normalized method bodies. A new declaration calls the indexed symbol when the literal or the normalized body already exists. Vector similarity is not a gate.
- **Project Scan:** The gate an agent runs in every repository before it finishes a change. A changed line passes when it adds no canonical-reuse finding, copied token block, credential, dangerous sink, or high/critical advisory. A changed manifest passes when a lockfile is present and the resolved versions have no advisory. A Claude Code or Cursor stop hook blocks completion until the scan passes.
