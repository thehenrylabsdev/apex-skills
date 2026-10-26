# Multi-Harness Installation & Setup Guide (`docs/INSTALLATION.md`)

`apex-skills` uses a **flat promoted-only `skills/<name>/SKILL.md` layout** paired with native plugin manifests for every major AI coding agent in 2026.

> [!IMPORTANT]
> **Pick One Installation Route per Harness:** Either install as a **Managed Plugin** (updates automatically when versions bump) OR install editable files via **`npx skills@latest add`** (copies files into your repo/home directory). Installing both simultaneously registers every skill twice.

---

## 1. Compatibility Matrix

| Agent Harness | Manifest / Mechanism Used | Auto-Updates? |
| :--- | :--- | :--- |
| **Claude Code** | `.claude-plugin/marketplace.json` + `.claude-plugin/plugin.json` | Yes |
| **OpenAI Codex** | `.codex-plugin/plugin.json` + `skills/*/agents/openai.yaml` | Yes (at startup) |
| **GitHub Copilot (CLI & VS Code)** | `.claude-plugin/marketplace.json` + `.claude-plugin/plugin.json` | Yes (with `autoUpdate: true`) |
| **Cursor** | `.cursor-plugin/plugin.json` + `plugin.json` | Yes |
| **Gemini CLI & Antigravity** | `gemini-extension.json` + flat `skills/<name>/SKILL.md` | Manual `gemini skills install` |
| **OpenCode, Windsurf, Devin, Amp** | `npx skills@latest add` (`skills.sh`) | Manual `npx skills@latest update` |

---

## 2. Step-by-Step Installation by Harness

### Option A: Claude Code (Managed Plugin)

```bash
claude plugin marketplace add thehenrylabsdev/apex-skills
claude plugin install apex-skills@apex-skills-marketplace
```

### Option B: OpenAI Codex (Managed Plugin)

```bash
codex plugin marketplace add thehenrylabsdev/apex-skills
codex plugin add apex-skills@apex-skills-marketplace
```

### Option C: GitHub Copilot CLI & VS Code

```bash
copilot plugin marketplace add thehenrylabsdev/apex-skills
copilot plugin install apex-skills@apex-skills-marketplace
```

To enable automatic updates in `~/.copilot/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "apex-skills-marketplace": {
      "source": { "source": "github", "repo": "thehenrylabsdev/apex-skills" },
      "autoUpdate": true
    }
  }
}
```

### Option D: Gemini CLI & Google Antigravity

Because `apex-skills` uses a flat `skills/<name>/` directory, a single command installs all 17 skills:

```bash
gemini skills install https://github.com/thehenrylabsdev/apex-skills.git --path skills
```

### Option E: Universal `skills.sh` Installer (All Agents, or Single-Skill Install)

```bash
# Install all 17 skills for a specific agent (cursor, claude-code, codex, opencode, windsurf, devin):
npx skills@latest add thehenrylabsdev/apex-skills -a cursor

# Install a single self-contained skill:
npx skills@latest add thehenrylabsdev/apex-skills --skill=apex-tdd
```

---

## 3. Bootstrapping a Project After Installation

Once `apex-skills` is installed in your agent harness:

1. Run `/apex-setup` inside your target repository to initialize `GLOSSARY.md`, `CONSTRAINTS.md`, `DECISIONS.md`, and the compact `## Apex Context Pointers` section in `AGENTS.md` / `CLAUDE.md`.
2. Run `/apex-setup --verify` anytime to audit your repository for memory drift without modifying files.
3. Run `/apex-router` whenever starting a new feature, refactor, or bug investigation to select the optimal workflow and Smart-Zone (`< 150k` tokens) phase boundary strategy.
