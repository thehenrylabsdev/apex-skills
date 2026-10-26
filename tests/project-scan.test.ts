import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { evaluateAdapters } from "../src/scan-adapters.js";
import { matchCloneWindows } from "../src/scan-clones.js";
import { evaluateCve, parseNpmAudit, readOsvIds } from "../src/scan-cve.js";
import { findSecurityFindings } from "../src/scan-security.js";
import { parseUnifiedDiff } from "../src/scan-diff.js";
import {
  HOOK_SCRIPT,
  installProjectHooks,
  parseHookInput,
  replyForHook,
} from "../src/scan-hooks.js";
import type { CommandResult, ScanIo, ScanReport } from "../src/scan-model.js";
import { findSecretFindings } from "../src/scan-secrets.js";

const CLEAN_AUDIT = JSON.stringify({
  metadata: {
    vulnerabilities: { info: 0, low: 0, moderate: 1, high: 0, critical: 0, total: 1 },
  },
  vulnerabilities: {},
});

const HIGH_AUDIT = JSON.stringify({
  metadata: {
    vulnerabilities: { info: 0, low: 0, moderate: 0, high: 1, critical: 1, total: 2 },
  },
  vulnerabilities: {
    "left-pad": { name: "left-pad", severity: "high" },
    lodash: { name: "lodash", severity: "critical" },
  },
});

void describe("Project scan", () => {
  void it("flags live credentials and ignores examples, placeholders, and commit shas", () => {
    const aws = ["AK", "IA", "IOSFODNN7REALKEY"].join("");
    const example = ["AK", "IA", "IOSFODNN7EXAMPLE"].join("");
    const privateKey = ["-----BEGIN ", "RSA PRIVATE KEY-----"].join("");
    const assigned = ["ab", "c1234567890xyzQ"].join("");
    const findings = findSecretFindings([
      { file: "src/App.java", line: 4, text: `token=${aws}` },
      { file: "src/App.java", line: 5, text: `sample=${example}` },
      { file: "src/App.java", line: 6, text: privateKey },
      { file: "src/App.java", line: 7, text: `api_key = "${assigned}"` },
      { file: "src/App.java", line: 8, text: 'password = "example-token-123456789"' },
      {
        file: "src/App.java",
        line: 9,
        text: 'secret = "0123456789abcdef0123456789abcdef01234567"',
      },
      { file: "package-lock.json", line: 1, text: `token=${aws}` },
    ]);
    assert.deepEqual(
      findings.map((finding) => finding.pattern),
      ["AWS access key", "private key", "credential assignment"],
    );
  });

  void it("reads added lines from a unified diff", () => {
    const added = parseUnifiedDiff(
      [
        "diff --git a/src/App.java b/src/App.java",
        "--- a/src/App.java",
        "+++ b/src/App.java",
        "@@ -1,0 +1,1 @@",
        "+token=value",
      ].join("\n"),
    );
    assert.deepEqual(added, [{ file: "src/App.java", line: 1, text: "token=value" }]);
  });

  void it("fails npm audit on high or critical advisories and passes when those counts are zero", () => {
    const clean = parseNpmAudit(CLEAN_AUDIT);
    const high = parseNpmAudit(HIGH_AUDIT);
    if (clean === null || high === null) {
      throw new Error("audit fixture did not parse");
    }
    assert.equal(clean.high, 0);
    assert.deepEqual(high.names, ["left-pad", "lodash"]);
    const root = mkdtempSync(path.join(tmpdir(), "apex-cve-"));
    try {
      writeFileSync(path.join(root, "package-lock.json"), "{}\n");
      const failed = evaluateCve(root, ["package.json"], fakeIo(HIGH_AUDIT, 1));
      assert.equal(failed.status, "fail");
      assert.match(failed.summary, /left-pad/);
      const passed = evaluateCve(root, ["package.json"], fakeIo(CLEAN_AUDIT, 0));
      assert.equal(passed.status, "pass");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  void it("blocks a changed Gradle manifest until a lockfile exists", () => {
    const check = evaluateCve("/tmp/apex-scan-missing", ["backend/build.gradle.kts"], fakeIo("", 0));
    assert.equal(check.status, "fail");
    assert.match(check.summary, /lockfile/);
  });

  void it("reads OSV advisories for a Go lockfile", () => {
    assert.deepEqual(
      readOsvIds(JSON.stringify({ results: [{ vulns: [{ id: "GO-2026-0001" }] }] })),
      ["GO-2026-0001"],
    );
    const root = mkdtempSync(path.join(tmpdir(), "apex-osv-"));
    try {
      writeFileSync(path.join(root, "go.sum"), "example.com/order v1.2.3 h1:abc\n");
      const failed = evaluateCve(root, ["go.sum"], fakeIo(
        JSON.stringify({ results: [{ vulns: [{ id: "GO-2026-0001" }] }] }),
        0,
      ));
      assert.equal(failed.status, "fail");
      assert.match(failed.summary, /GO-2026-0001/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  void it("flags a dangerous sink and a copied token block", () => {
    const sinks = findSecurityFindings([
      { file: "src/App.ts", line: 3, text: "element.innerHTML = input;" },
      { file: "README.md", line: 1, text: "element.innerHTML = input;" },
    ]);
    assert.equal(sinks.length, 1);
    assert.equal(sinks[0]?.rule, "html-injection");
    const body = [
      "func Settle(order Order) Result {",
      "if order.Empty() { return Result{Code: Missing} }",
      "receipt := ledger.Post(order.Amount)",
      "audit.Record(order.Id, receipt.Number)",
      "notify.Customer(order.Owner)",
      "return Result{Code: Settled, Receipt: receipt}",
      "}",
    ].join("\n");
    const clones = matchCloneWindows(
      [
        { file: "src/order.go", text: body },
        { file: "src/payment.go", text: body },
      ],
      new Set(["src/payment.go:1"]),
    );
    assert.equal(clones.length > 0, true);
    assert.equal(clones[0]?.otherFile, "src/order.go");
  });

  void it("fails a configured adapter whose binary is missing", () => {
    const root = mkdtempSync(path.join(tmpdir(), "apex-adapter-"));
    try {
      writeFileSync(path.join(root, "sonar-project.properties"), "sonar.projectKey=demo\n");
      const check = evaluateAdapters(root, fakeIo("", 0));
      assert.equal(check.status, "fail");
      assert.match(check.summary, /sonar-scanner/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  void it("keeps an existing settings key when installing project hooks", () => {
    const root = mkdtempSync(path.join(tmpdir(), "apex-hooks-"));
    try {
      const claudeDir = path.join(root, ".claude");
      mkdirSync(claudeDir);
      writeFileSync(
        path.join(claudeDir, "settings.json"),
        `${JSON.stringify({ permissions: { allow: ["Bash(npm test)"] } })}\n`,
      );
      installProjectHooks(root);
      installProjectHooks(root);
      const settings = JSON.parse(
        readFileSync(path.join(root, ".claude", "settings.json"), "utf8"),
      ) as { readonly permissions: { readonly allow: readonly string[] }; readonly hooks: { readonly Stop: readonly unknown[] } };
      assert.deepEqual(settings.permissions.allow, ["Bash(npm test)"]);
      assert.equal(settings.hooks.Stop.length, 1);
      assert.equal(readFileSync(path.join(root, "hooks", "apex-scan.sh"), "utf8"), HOOK_SCRIPT);
      assert.equal(readFileSync("hooks/apex-scan.sh", "utf8"), HOOK_SCRIPT);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  void it("asks Cursor to continue and blocks Claude Code when the scan fails", () => {
    const report: ScanReport = {
      blocked: true,
      checks: [{ id: "secrets", status: "fail", summary: "src/App.java:4 matches AWS access key." }],
    };
    const cursor = replyForHook(
      report,
      parseHookInput(JSON.stringify({ hook_event_name: "stop", status: "completed", loop_count: 0, workspace_roots: ["/repo"] })),
    );
    assert.equal(cursor.exitCode, 0);
    assert.match(cursor.stdout, /followup_message/);
    const capped = replyForHook(
      report,
      parseHookInput(JSON.stringify({ hook_event_name: "stop", status: "completed", loop_count: 5 })),
    );
    assert.equal(capped.stdout.trim(), "{}");
    const claude = replyForHook(
      report,
      parseHookInput(JSON.stringify({ hook_event_name: "Stop", stop_hook_active: false, cwd: "/repo" })),
    );
    assert.equal(claude.exitCode, 2);
    assert.match(claude.stderr, /AWS access key/);
  });

  void it("fails the git scan when a new file contains a credential", () => {
    const root = mkdtempSync(path.join(tmpdir(), "apex-scan-git-"));
    try {
      writeFileSync(path.join(root, "README.md"), "hello\n");
      git(root, ["init", "-b", "main"]);
      git(root, ["add", "."]);
      commit(root, "init");
      const key = ["AK", "IA", "IOSFODNN7REALKEY"].join("");
      writeFileSync(path.join(root, "application.properties"), `token=${key}\n`);
      const failed = runScan(["--root", root, "--base", "HEAD"]);
      assert.equal(failed.code, 1);
      assert.match(failed.stdout, /secrets: fail/);
      rmSync(path.join(root, "application.properties"));
      writeFileSync(path.join(root, "notes.md"), "no credential here\n");
      const passed = runScan(["--root", root, "--base", "HEAD"]);
      assert.equal(passed.code, 0, passed.stdout + passed.stderr);
      assert.match(passed.stdout, /\[Apex Scan\] PASS/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

function fakeIo(stdout: string, exitCode: number): ScanIo {
  const result: CommandResult = { exitCode, stdout, stderr: "" };
  return {
    cwd: process.cwd(),
    run(): CommandResult {
      return result;
    },
    commandExists(): boolean {
      return false;
    },
    readStdin(): string {
      return "";
    },
  };
}

function git(cwd: string, args: readonly string[]): void {
  execFileSync("git", ["-C", cwd, ...args], { stdio: "ignore" });
}

function commit(cwd: string, message: string): void {
  execFileSync(
    "git",
    ["-C", cwd, "-c", "user.email=scan@example.com", "-c", "user.name=Scan", "commit", "-m", message],
    { stdio: "ignore" },
  );
}

function runScan(args: readonly string[]): {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
} {
  const result = spawnSync(process.execPath, ["dist/src/cli.js", "scan", ...args], {
    encoding: "utf8",
  });
  return { code: result.status ?? 1, stdout: result.stdout, stderr: result.stderr };
}
