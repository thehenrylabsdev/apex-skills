---
name: apex-spec
description: "Author a compact, verifiable engineering specification with public seam contracts, invariants, ratchets, and out-of-scope boundaries."
disable-model-invocation: true
---

# Apex Spec: Counter-Prior Specification & Public Seam Contract

Transform clarified requirements into a high-density engineering specification that locks **Public Seams**, **Invariants**, and **Verification Ratchets** before implementation begins.

## Process

1. **Resolve Remaining Ambiguities:** If any load-bearing design branch is still open, call the Skill tool with `apex-grill` and `apex-memory` first.
2. **Draft the Specification (`docs/specs/<feature>.md` or tracker issue):**
   Include only load-bearing sections (zero filler prose):
   - **Problem & Goal:** 2-3 sentences using `GLOSSARY.md` Ubiquitous Language.
   - **Public Seam Contracts:** Exact TypeScript/language signatures, HTTP/IPC schemas, and error types at module boundaries (Deep Modules: narrow interface, hidden internals).
   - **State & Invariant Rules:** Preconditions, postconditions, and concurrency constraints.
   - **Verification Matrix:** Exact seam-level test scenarios (Red -> Green vertical slices) and `CONSTRAINTS.md` ratchet targets.
   - **Explicit Out-of-Scope:** What this spec deliberately does not build.
3. **Confirm Seam Lock:** Present the Public Seam Contracts for a single `"yes"` confirmation before transitioning to implementation.
