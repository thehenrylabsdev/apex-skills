---
name: apex-guard
description: "Audit security vulnerabilities, OWASP risks, auth flaws, web performance, Core Web Vitals, N+1 queries, and WCAG accessibility compliance."
---

# Apex Guard: Self-Contained Security, Performance & Accessibility Gate

Enforce production-grade non-functional invariants across **Security (OWASP)**, **Performance (CWV & Database)**, and **Accessibility (WCAG 2.2 AA)** with zero external file dependencies.

## 1. Security Gate (OWASP Top 10 & Auth Boundaries)
- [ ] **Injection & Deserialization:** Parameterized queries only; strict schema validation (Zod/TypeBox/Pydantic) at every untrusted ingress boundary.
- [ ] **AuthN / AuthZ (BOLA/IDOR):** Verify resource ownership at the data-access seam on every mutation and read endpoint; never trust client-supplied tenant or role IDs.
- [ ] **SSRF & Egress:** Validate outbound URLs against an allowlist and block RFC1918/link-local metadata IPs (`169.254.169.254`).
- [ ] **Secrets & Crypto:** Zero hardcoded secrets or tokens in source/logs; constant-time signature comparisons (`timingSafeEqual`).
- [ ] **Dependency Channel:** A dependency added in this change uses the release from Call the Skill tool with `apex-versions`. An existing manifest version stays unchanged unless the user asked to upgrade it.

## 2. Performance & Database Gate (Core Web Vitals & Query Plans)
- [ ] **Query Complexity:** Eliminate N+1 query loops (batch via `WHERE id IN (...)` or DataLoader); verify composite index coverage on filter/sort columns.
- [ ] **Unbounded Memory/IO:** Enforce pagination (`limit <= 100`) and streaming on collection endpoints; set explicit timeouts and circuit breakers on external calls.
- [ ] **Frontend CWV:** Keep LCP `< 2.5s`, INP `< 200ms`, CLS `< 0.1`; prevent layout shifts and main-thread long tasks (`> 50ms`).

## 3. Accessibility & UI Gate (WCAG 2.2 AA)
- [ ] **Contrast Ratios:** Normal text `>= 4.5:1`; large text (`>= 24px` or `>= 18.67px` bold) and non-text UI controls/focus rings `>= 3.0:1`.
- [ ] **Target Size & Focus:** Interactive targets `>= 24x24` CSS px (`>= 44x44` px on mobile); visible `>= 2px` keyboard focus ring; clean reflow at `320px` width.
- [ ] **No Generic Unicode Emojis:** Use dedicated vector icon packages (`lucide-react`, `@phosphor-icons/react`, inline SVG), never unicode emojis as UI controls.

## 4. Project Scan (every repository)

Finish a change only after `npx apex-skills scan` prints `PASS`. The same command is the gate for a web app, mobile app, desktop app, backend, and game. A changed line passes when it adds no canonical-reuse finding, copied token block, credential, or dangerous sink. `reuse` and `clones` mean call the existing symbol. `secrets` means remove the credential and rotate it. `security` means replace the sink with the safe operation named in the report. `cve` means upgrade the advisory through Call the Skill tool with `apex-versions`. A Gradle, Maven, Go, Rust, Python, Composer, NuGet, or Swift manifest passes when a lockfile sits beside it and the resolved versions have no advisory.

```bash
npx apex-skills hooks install
npx apex-skills hooks install --global
```

The Claude Code Stop hook and the Cursor stop hook run the scan when the agent tries to finish. `--global` covers later repositories on this machine. CI runs the same command, so a host without a stop hook still cannot merge a failing diff. An untouched existing line stays out of the gate until a later edit includes it. SonarQube and gitleaks join the same `PASS` when `sonar-project.properties`, `.gitleaks.toml`, or `.apex/scan.json` opts in. A configured adapter whose binary is missing stays a failed scan.
