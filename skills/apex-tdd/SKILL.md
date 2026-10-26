---
name: apex-tdd
description: "Implement features or behavior changes test-first using seam-based TDD, vertical tracer bullets, deep modules, and unit or integration tests."
---

# Apex TDD: Heterodox Seam-Based TDD & Deep Modules

Build software through **Vertical Tracer Bullets** tested strictly at **Pre-Agreed Public Seams**, optimizing for John Ousterhout's **Deep Modules** (narrow interface, deep implementation leverage).

## Counter-Prior Rules

1. **Confirm Public Seams Before Writing Tests:** Before writing the first test, list the exact public interface seams you will test against and confirm them with the user (unless already locked in the active spec). Test behavior across module boundaries, never internal private helpers or shallow mocks.
2. **Vertical Tracer Bullets (One Slice at a Time):** Never write 10 failing tests upfront. Execute a tight Red -> Green loop for **1 vertical slice** at a time:
   - **RED:** Write 1 minimal test at the public seam and run it to verify it fails for the expected reason.
   - **GREEN:** Write the minimal implementation that turns the test green and satisfies `CONSTRAINTS.md` ratchets.
3. **Zero Refactoring Inside the Red-Green Loop:** Implementation carries maximum context pressure. Do **not** mix structural refactoring into the Red-Green cycle; defer smell cleanup until all slices are green or to `apex-verify`.

## Anti-Rationalization Table

| Agent Excuse | Counter-Prior Reality |
| :--- | :--- |
| *"It's a 1-line behavior change, I'll test after."* | 1-line changes without a seam test cause silent regressions. Write the 5-line seam assertion first. |
| *"I'll mock the internal repository class for speed."* | Mocking internal collaborators couples tests to shallow implementation details. Test at the public seam. |
| *"Let me clean up this adjacent class while I'm here."* | Mid-loop refactoring pollutes diffs and breaks mental invariants. Finish Green first. |

## Release Channel
When a slice scaffolds a runtime or introduces a dependency, Call the Skill tool with `apex-versions` and install only the version it selects. An explicit user version and an existing manifest entry stay as written.

## Verification Gate
- [ ] Every new behavior was observed failing (`RED`) before the implementation line was written.
- [ ] All tests target public module seams with zero unverified internal mocks.
- [ ] Full test suite, typechecker, and `CONSTRAINTS.md` ratchets pass.
