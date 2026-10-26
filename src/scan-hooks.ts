import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isRecord } from "./json-record.js";
import type { HookReply, ScanReport } from "./scan-model.js";

export const PROJECT_HOOK_COMMAND = "hooks/apex-scan.sh";
const CLAUDE_SETTINGS_FILE = ".claude/settings.json";
const CURSOR_HOOKS_FILE = ".cursor/hooks.json";

export const HOOK_SCRIPT = `#!/bin/sh
set -u
ROOT=$(pwd)
if [ -n "\${CLAUDE_PROJECT_DIR:-}" ]; then
  ROOT=$CLAUDE_PROJECT_DIR
fi
CLI=""
if [ -n "\${CLAUDE_PLUGIN_ROOT:-}" ] && [ -f "\${CLAUDE_PLUGIN_ROOT}/dist/src/cli.js" ]; then
  CLI="\${CLAUDE_PLUGIN_ROOT}/dist/src/cli.js"
elif [ -n "\${CURSOR_PLUGIN_ROOT:-}" ] && [ -f "\${CURSOR_PLUGIN_ROOT}/dist/src/cli.js" ]; then
  CLI="\${CURSOR_PLUGIN_ROOT}/dist/src/cli.js"
elif [ -f "$ROOT/dist/src/cli.js" ] && [ -f "$ROOT/src/scan-cli.ts" ]; then
  CLI="$ROOT/dist/src/cli.js"
elif [ -f "$ROOT/node_modules/apex-skills/dist/src/cli.js" ]; then
  CLI="$ROOT/node_modules/apex-skills/dist/src/cli.js"
fi
if [ -n "$CLI" ]; then
  exec node "$CLI" scan --hook
fi
if command -v apex-skills >/dev/null 2>&1; then
  exec apex-skills scan --hook
fi
exec npx --no-install apex-skills scan --hook
`;

export interface HookInput {
  readonly host: "cursor" | "claude" | "plain";
  readonly status: string | null;
  readonly loopCount: number | null;
  readonly workspaceRoot: string | null;
}

export function formatScanReport(report: ScanReport): string {
  const lines = report.checks.map(
    (check) => `[Apex Scan] ${check.id}: ${check.status} — ${check.summary}`,
  );
  lines.push(report.blocked ? "[Apex Scan] FAIL" : "[Apex Scan] PASS");
  return `${lines.join("\n")}\n`;
}

export function parseHookInput(raw: string): HookInput {
  const empty: HookInput = {
    host: "plain",
    status: null,
    loopCount: null,
    workspaceRoot: null,
  };
  if (raw.trim().length === 0) {
    return empty;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return empty;
  }
  if (!isRecord(parsed)) {
    return empty;
  }
  const event = parsed["hook_event_name"];
  const status = typeof parsed["status"] === "string" ? parsed["status"] : null;
  const loopCount = typeof parsed["loop_count"] === "number" ? parsed["loop_count"] : null;
  const cwd = typeof parsed["cwd"] === "string" ? parsed["cwd"] : null;
  const roots = parsed["workspace_roots"];
  const firstRoot = Array.isArray(roots) && typeof roots[0] === "string" ? roots[0] : null;
  let host: HookInput["host"] = "plain";
  if (event === "stop" || status !== null || loopCount !== null) {
    host = "cursor";
  } else if (event === "Stop" || typeof parsed["stop_hook_active"] === "boolean") {
    host = "claude";
  }
  return {
    host,
    status,
    loopCount,
    workspaceRoot: firstRoot ?? cwd,
  };
}

export function replyForHook(report: ScanReport, input: HookInput): HookReply {
  const text = formatScanReport(report);
  if (input.host === "cursor") {
    if (
      input.status === "aborted" ||
      input.status === "error" ||
      (input.loopCount !== null && input.loopCount >= 5) ||
      !report.blocked
    ) {
      return { exitCode: 0, stdout: "{}\n", stderr: "" };
    }
    return {
      exitCode: 0,
      stdout: `${JSON.stringify({ followup_message: text.trim() })}\n`,
      stderr: text,
    };
  }
  if (!report.blocked) {
    return { exitCode: 0, stdout: "", stderr: "" };
  }
  const reason = text.trim();
  return {
    exitCode: 2,
    stdout: `${JSON.stringify({ decision: "block", reason })}\n`,
    stderr: `${reason}\n`,
  };
}

export function installProjectHooks(root: string): readonly string[] {
  writeScript(path.join(root, "hooks", "apex-scan.sh"));
  mergeClaude(path.join(root, CLAUDE_SETTINGS_FILE), PROJECT_HOOK_COMMAND);
  mergeCursor(path.join(root, CURSOR_HOOKS_FILE), PROJECT_HOOK_COMMAND);
  return ["hooks/apex-scan.sh", CLAUDE_SETTINGS_FILE, CURSOR_HOOKS_FILE];
}

export function installGlobalHooks(home: string): readonly string[] {
  const claudeScript = path.join(home, ".claude", "hooks", "apex-scan.sh");
  const cursorScript = path.join(home, ".cursor", "hooks", "apex-scan.sh");
  writeScript(claudeScript);
  writeScript(cursorScript);
  mergeClaude(path.join(home, CLAUDE_SETTINGS_FILE), claudeScript);
  mergeCursor(path.join(home, CURSOR_HOOKS_FILE), "./hooks/apex-scan.sh");
  return [
    ".claude/hooks/apex-scan.sh",
    CLAUDE_SETTINGS_FILE,
    ".cursor/hooks/apex-scan.sh",
    CURSOR_HOOKS_FILE,
  ];
}

function writeScript(file: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, HOOK_SCRIPT, { mode: 0o755 });
}

function mergeClaude(file: string, command: string): void {
  const current = readJsonObject(file);
  const hooks = isRecord(current["hooks"]) ? { ...current["hooks"] } : {};
  const stop = copyUnknownArray(hooks["Stop"]);
  if (!jsonContains(stop, command)) {
    stop.push({ hooks: [{ type: "command", command, timeout: 300 }] });
  }
  hooks["Stop"] = stop;
  current["hooks"] = hooks;
  writeJson(file, current);
}

function mergeCursor(file: string, command: string): void {
  const current = readJsonObject(file);
  if (!("version" in current)) {
    current["version"] = 1;
  }
  const hooks = isRecord(current["hooks"]) ? { ...current["hooks"] } : {};
  const stop = copyUnknownArray(hooks["stop"]);
  if (!jsonContains(stop, command)) {
    stop.push({ command, timeout: 300, loop_limit: 5 });
  }
  hooks["stop"] = stop;
  current["hooks"] = hooks;
  writeJson(file, current);
}

function readJsonObject(file: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as unknown;
    if (!isRecord(parsed)) {
      throw new Error(`${file} must be a JSON object.`);
    }
    return parsed;
  } catch (error: unknown) {
    if (isMissingFile(error)) {
      return {};
    }
    if (error instanceof Error && error.message.endsWith("must be a JSON object.")) {
      throw error;
    }
    throw new Error(`${file} must be valid JSON before the hook install can merge it.`, {
      cause: error,
    });
  }
}

function writeJson(file: string, value: Record<string, unknown>): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function jsonContains(value: unknown, command: string): boolean {
  if (typeof value === "string") {
    return value === command;
  }
  if (Array.isArray(value)) {
    return value.some((entry) => jsonContains(entry, command));
  }
  if (isRecord(value)) {
    return Object.values(value).some((entry) => jsonContains(entry, command));
  }
  return false;
}

function copyUnknownArray(value: unknown): unknown[] {
  if (!isUnknownArray(value)) {
    return [];
  }
  return [...value];
}

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function isMissingFile(error: unknown): boolean {
  return isRecord(error) && error["code"] === "ENOENT";
}
