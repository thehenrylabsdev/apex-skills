---
name: apex-versions
description: "Pick current stable or LTS release when scaffolding apps or adding a dependency. Honor a named version. Keep manifest versions unchanged."
---

# Apex Versions: Release-Channel Selection

Training-cutoff releases miss current security fixes. Before a new manifest records a version, resolve it through the package manager and the local Version Ledger. A ledger entry younger than one observed stable release cycle is authoritative. Use a web search only when the resolver returns `action: "needs-websearch"`, then persist that result with `versions record`.

## Selection Rules

1. **Explicit Version Pin.** When the user names a version, install that version (`--mode pin --version <exact>`). When `compatible` is false, say so and keep the pin.
2. **Manifest Hold.** When the manifest already lists the package and the user did not ask to add, replace, or upgrade it, keep the installed version (`--mode hold --version <installed>`).
3. **Greenfield scaffold.** Resolve runtime, then language, then framework (`--mode scaffold`). When an LTS release is present and its support window is still open, install that LTS release. Otherwise install the newest stable release.
4. **New dependency.** Pass every host language and framework already chosen (`--mode add --host <ecosystem>:<name>@<version>`). Install `selectedVersion`: the recommended release, or the newest older stable release whose declared peer, engine, and developed-against constraints accept those hosts. A host the package does not mention is unconstrained.

## Resolver

Run this from the target repository:

```bash
npx apex-skills versions resolve --ecosystem npm --name vitest --mode add --host node-runtime:node@22.14.0 --host npm:typescript@5.9.3 --host npm:next@16.4.3
```

Install when `action` is `use`, `pin`, or `hold`.

When `action` is `needs-websearch`, search once with `suggestedQuery`, persist the stable release, the LTS release when one exists, the cadence in days, and the support end date, then resolve again:

```bash
npx apex-skills versions record --ecosystem npm --name vitest --latest 5.0.5 --cadence-days 21 --support-until 2027-06-01 --source websearch
npx apex-skills versions resolve --ecosystem npm --name vitest --mode add --host npm:typescript@5.9.3
```

When `action` is `incompatible`, stop and ask the user which host to change.

## Channels

| Ecosystem | `--ecosystem` | `--name` |
| :--- | :--- | :--- |
| npm, pnpm, yarn | `npm` | package name (`typescript`, `next`, `vitest`) |
| Maven and Gradle | `maven` | `group:artifact` |
| pip and uv | `pypi` | distribution name (`fastapi`) |
| Cargo | `cargo` | crate name |
| Go modules | `go` | module path |
| Node.js | `node-runtime` | `node` |
| Python | `python-runtime` | `python` |
| Java | `java-runtime` | `java` |
| Rust | `rust-runtime` | `rust` |

Scaffold order is runtime, language, framework, then libraries. Each later resolve receives the versions already selected as `--host`.

## Anti-Rationalization

| Agent excuse | Release-channel reality |
| :--- | :--- |
| "I will use the version I remember from training." | Resolve through the ledger. Training memory is not a release channel. |
| "Latest might break the stack, so I will pick a familiar older version." | Install `selectedVersion`. Host compatibility is already applied. |
| "I should upgrade the framework while adding this library." | Manifest Hold keeps that framework until the user asks to change it. |
