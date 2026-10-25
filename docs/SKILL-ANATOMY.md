# Skill Anatomy & Authoring Standard (`docs/SKILL-ANATOMY.md`)

Every skill in `apex-skills` follows a strict information-theoretic structure designed to maximize behavioral adherence while minimizing token overhead.

---

## 1. Model-Invoked vs. User-Invoked Split

Every skill belongs to one of two invocation budgets:

1. **Model-Invoked Core Skills (`disable-model-invocation` omitted):**
   - Reachable autonomously by the model or explicitly by the user.
   - Its YAML `description` is injected into the active context window on every turn.
   - **Rule:** Only create a model-invoked skill for high-frequency inner-loop disciplines (`apex-grill`, `apex-tdd`, `apex-diagnose`, `apex-verify`, `apex-guard`, `apex-memory`).
2. **User-Invoked Workflow Skills (`disable-model-invocation: true`):**
   - Reachable **only** when the human explicitly invokes `/apex-<name>`.
   - Zero always-loaded context cost (`0` tokens at Turn 0).
   - Paired with `policy.allow_implicit_invocation: false` in `skills/<name>/agents/openai.yaml`.

---

## 2. The 4 Authoring Principles

### Principle 1: The Behavioral Deletion Test
Never write encyclopedic tutorials in `SKILL.md`. Frontier models already know standard software engineering definitions from pre-training. Every sentence in a skill must pass the **Deletion Test**:
> *If removing this sentence does not cause the model to revert to a known failure habit, delete the sentence.*

### Principle 2: Positive Framing Over Negation ("Don't Think of an Elephant")
Negated prohibitions activate the forbidden concept in Transformer attention. State the positive operational target instead:
- **Weak (Negation):** *"Do not mock internal private classes or write 10 tests at once."*
- **Strong (Positive Target):** *"Write 1 vertical tracer-bullet test at the pre-agreed public seam and observe it fail before writing the implementation."*

### Principle 3: Leading Words
Use high-leverage domain terms that recruit deep pre-training priors in a few tokens: *"unblocked frontier"*, *"load-bearing repro"*, *"public seam"*, *"deep module"*, *"vertical tracer bullet"*, *"two-way door"*.

### Principle 4: Mandatory `LEAF-AGENT GUARD` for Subagents
Any skill that instructs the agent to spawn subagents must include an explicit `LEAF-AGENT GUARD` block prohibiting child subagents from invoking skills or spawning nested agents.
