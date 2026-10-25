---
name: apex-handoff
description: "Write a loss-minimized, commit-pinned portable handoff artifact (.apex/handoff.md) for cross-harness or cross-session continuation."
disable-model-invocation: true
---

# Apex Handoff: Loss-Minimized Portable Session Serialization

Serialize the current session's high-signal state into `.apex/handoff.md` when switching harnesses (Claude Code <-> Codex <-> Cursor <-> Gemini/Antigravity), changing machines, or forking a side task.

## Process

1. **Capture Git & Environment Anchor:**
   - Record current branch, `git rev-parse --short HEAD`, and `git status --short`.
2. **Write `.apex/handoff.md` (Under 80 Lines, Zero Prose Fluff):**
   - **Objective & Active Seam:** What is being built and the exact public seam currently in focus.
   - **Completed Slices (Verified Green):** Bullet list of finished tracer bullets with commit SHAs.
   - **Load-Bearing Decisions & Dead Ends (Crucial):** Why specific approaches were chosen AND which approaches were tried and rejected (so the next session never repeats a failed experiment).
   - **Exact Next Command:** The single test or command the receiving agent should run on turn 1.
