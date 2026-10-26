---
name: apex-reuse
description: "Audit the canonical reuse index before adding a constant, string literal, or method, and call the existing symbol instead of a near-clone."
---

# Apex Reuse: Canonical Symbol Index

SQLite, tree-sitter, LSP, and a vector index can retrieve code. They do not stop a new constant or a near-clone method from landing. The gate is a normalized body hash in the repository reuse index. The same bytes produce the same verdict on Claude Code, Codex, Cursor, and Antigravity.

## Gate

From the repository being edited:

```bash
npx apex-skills reuse lookup --literal "order.created"
npx apex-skills reuse lookup --name handle
npx apex-skills reuse audit --base HEAD
```

`lookup` prints the canonical symbol, or `NO_CANONICAL` when the index has no match. `audit` compares the change against `--base`. A clean report is the only passing result.

When the report names a canonical symbol, call that symbol. When the reason is `enum-fanout`, add the input type or enum as a parameter of the canonical method. When the report is empty, the new symbol is canonical once it is committed. Refresh the index with:

```bash
npx apex-skills reuse index
```

The index covers Java, Kotlin, TypeScript, JavaScript, and Python. It stores string constants, raw domain literals, and brace or `def` method bodies. A method joins the clone floor at 12 normalized tokens with 2 structural tokens, so a one-line getter stays out. Test paths are excluded. A literal that contains a space, slash, or colon stays out of the literal gate. Embeddings stay off the gate: enum fan-out is a hash match, not a nearest-neighbor guess.

## Anti-Rationalization

| Agent excuse | Reuse reality |
| :--- | :--- |
| "A private constant in this class is easier to read." | `lookup` already named the canonical constant. Call it. |
| "This method takes a different enum, so it is a new method." | `enum-fanout` means one method. The enum is a parameter. |
| "I will dedupe after the tests are green." | The GREEN line calls the canonical symbol. `reuse audit` is part of GREEN. |
| "The vector search did not return this file." | The hash index is the gate. Retrieval is not. |
