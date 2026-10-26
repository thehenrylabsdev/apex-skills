# 4-Way Empirical Benchmark Report (`docs/BENCHMARK-REPORT.md`)

This report documents the methodology, mathematical equations, and live empirical measurements comparing **`apex-skills` (`v1.0.0`)** against **`LaurenTan` (`pstack` v0.15.32)**, **`addyosmani` (`agent-skills` v0.6.13)**, and **`mattpocock` (`skills` v1.3.1)**.

To reproduce all measurements directly from the repositories on disk, run:

```bash
npm run benchmark
```

---

## 1. Live Measured Comparison Table

| Metric | `LaurenTan` (`pstack`) | `addyosmani` (`agent-skills`) | `mattpocock` (`skills`) | **`apex-skills` (`v1.0.0`)** |
| :--- | :--- | :--- | :--- | :--- |
| Total Markdown Files / Lines | 139 files / 8,263 lines | 144 files / 23,005 lines | 133 files / 7,956 lines | **24 files / 1,012 lines** |
| Total Skills (Model vs. User-Invoked) | 58 (1 model / 57 user) | 25 (25 model / 0 user) | 38 (15 model / 23 user) | **18 (8 model / 10 user)** |
| **Cold-Start Token Tax (Turn 0)** | **5,168 tok** (20,669 B) | **5,095 tok** (20,379 B) | **922 tok** (3,688 B) | **342 tok** (1,365 B) |
| **Simulated Feature Uncached Input Tokens** | **383,192 tok** | **171,590 tok** | **109,500 tok** | **67,650 tok** |
| **Human Turn-Stops per Medium Feature** | **4 stops** | **12 stops** | **5 stops** | **2 stops** |
| Broken Standalone Links (`--skill` Issue #361) | 62 | 15 | 1 | **0** |
| Harness Built-In Command Collisions (#423/#857) | 0 | 0 | 3 | **0** |
| Unguarded Recursive Subagent Skills (#530/#573) | 1 | 2 | 4 | **0** |

---

## 2. Mathematical Model of Cold-Start & KV-Cache Token Economics

### 2.1. Turn-0 Cold-Start Token Tax ($T_{\text{cold}}$)

At Turn 0 of every coding session, an agent harness injects the frontmatter (`name` + `description`) of every **model-invoked** skill plus any mandatory `SessionStart` hook payload:

$$T_{\text{cold}} = \left\lceil \frac{1}{4} \left( \sum_{s \in S_{\text{model}}} \text{Bytes}(\text{Frontmatter}(s)) + \text{Bytes}(\text{Hook}_{\text{start}}) \right) \right\rceil$$

- **`LaurenTan`:** Only 1 skill (`poteto-mode`) is model-invoked (`307` B), but its description routes almost every engineering prompt directly into `skills/poteto-mode/SKILL.md` (`20,362` B) on Turn 1 $\implies$ **$5,168$ tokens**.
- **`addyosmani`:** All 25 skills are model-invoked (`9,933` B frontmatter) and `hooks/session-start.sh` injects `skills/using-agent-skills/SKILL.md` (`10,446` B) on session start $\implies$ **$5,095$ tokens**.
- **`mattpocock`:** 15 model-invoked skills (`3,688` B) and 23 user-invoked skills (`0` B) $\implies$ **$922$ tokens**.
- **`apex-skills`:** 8 model-invoked skills (`1,365` B) and 10 user-invoked skills (`0` B) $\implies$ **$342$ tokens** (**62.9% lower than `mattpocock` and 93.4% lower than `LaurenTan` & `addyosmani`**).

---

### 2.2. Multi-Round Feature KV-Cache Model ($T_{\text{feature}}$)

Consider a standard medium feature touching `15,000` tokens of source files ($C_{\text{code}} = 15,000$), decomposed into $K = 3$ vertical slices and undergoing $R = 3$ review-and-fix rounds with $M = 2$ review axes per round:

1. **Cold-Subagent-Per-Round Model (`LaurenTan` `feature.md`):**
   Because `feature.md` line 209 prohibits reusing `poteto-agent` across fix rounds, the orchestrator spawns:
   $$N_{\text{cold}} = 4_{\text{arch/interrogate}} + K + R \times (M + 1_{\text{comment-sicko}} + 1_{\text{fresh-fixer}}) = 4 + 3 + 3 \times 4 = 19 \text{ cold subagents}$$
   Each cold subagent must read the system/skill prefix and codebase context without sharing the prior fixer's KV-Cache:
   $$T_{\text{cold-feature}} = 19 \times (T_{\text{cold}} + C_{\text{code}}) = 19 \times (5,168 + 15,000) = \mathbf{383,192 \text{ uncached tokens}}$$

2. **Warm KV-Cache Reuse Model (`apex-skills` `/apex-waves` + `apex-verify`):**
   `apex-waves` maintains 1 warm implementer context and 2 Depth-1 Leaf reviewer contexts (`Spec Axis` and `Standards Axis`). Across $R = 3$ fix rounds, follow-up messages hit the **warm KV-Cache prefix** (billed at $0.1\times$ base input cost on frontier APIs):
   $$T_{\text{warm-feature}} = 3 \times (1,500 + 15,000) + 0.1 \times 11 \times (1,500 + 15,000) = \mathbf{67,650 \text{ effective uncached tokens}}$$
   This yields an **82.3% reduction in effective input token cost** while preserving full reasoning continuity across fix rounds.
