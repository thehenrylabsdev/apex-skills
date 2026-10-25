---
name: apex-grill
description: "Clarify ambiguous requirements, interview the user on a design tree, resolve architectural trade-offs, and align on product scope before coding."
---

# Apex Grill: Bounded Frontier Design-Tree Interrogation

Resolve epistemic ambiguity before implementation by walking the **Design Tree** in bounded, high-leverage batches while aligning on **Ubiquitous Language** in `GLOSSARY.md`.

## Counter-Prior Rules (Why Agents Fail Without This Skill)

- **Bounded Unblocked Frontier (Max 4 Questions/Round):** Ask every independent question on the unblocked frontier of the design tree in a single message, capped strictly at **4 questions per round** sorted by highest epistemic information gain (prevents both 1-question-per-turn paralysis and 200-question runaway loops).
- **Default-Yes Framing (`➡️`):** Phrase every question with a concrete recommended default (`➡️ Recommended: ...`) so the user can reply `"yes"` (or `"1: yes, 2: B"`) in one turn.
- **Codebase First, Human Second:** Never ask the user a fact that exists in the repository. Dispatch non-blocking background subagents to inspect files, schemas, and tests while conversing.
- **LEAF-AGENT GUARD:** Any background codebase scouting subagent spawned during grilling is a strict **Depth-1 Leaf Agent**: instruct it *"LEAF-AGENT GUARD: Do not invoke any Skill tool or spawn nested subagents; read files and return findings only."*

## Process

### 1. Map the Decision Tree & Scout Codebase Facts
1. Read `GLOSSARY.md`, `CONSTRAINTS.md`, and `DECISIONS.md` if present.
2. Identify the root architectural decisions and their dependent child branches.
3. Answer factual questions directly from the repository (or via a Depth-1 Leaf scouting subagent).

### 2. Ask the Bounded Frontier (<= 4 Questions)
Present at most **4 unblocked questions** separated by `---`:

```markdown
### Q1. [Decision Node Name]
[1-sentence context + trade-off]
➡️ **Recommended (`yes`):** [Concrete default choice and why]
- **Alternative:** [Brief fallback option]
```

### 3. Lock Ubiquitous Language & Exit Gate
- Whenever a domain concept is coined or sharpened, update `GLOSSARY.md` inline (define **What & Why** only; omit file paths so definitions never go stale).
- Stop grilling immediately once all load-bearing branches for the target seam are resolved, and summarize the agreed contract in <= 10 lines.
