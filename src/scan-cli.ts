import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { isRecord } from "./json-record.js";
import {
  formatScanReport,
  installGlobalHooks,
  installProjectHooks,
  parseHookInput,
  replyForHook,
} from "./scan-hooks.js";
import type { CommandResult, ScanIo } from "./scan-model.js";
import { runProjectScan } from "./scan-run.js";

export function executeScanCommand(args: readonly string[], io?: ScanIo): number {
  const parsed = parseScanArgs(args, io?.cwd ?? process.cwd());
  if (parsed === null) {
    process.stderr.write(
      "Usage: apex-skills scan [--root dir] [--base ref] [--hook]\n",
    );
    return 2;
  }
  const active = io ?? createDefaultIo();
  try {
    const stdin = parsed.hook ? active.readStdin() : "";
    const report = runProjectScan(
      { root: parsed.root, base: parsed.base, hook: parsed.hook, stdin },
      active,
    );
    if (parsed.hook) {
      const reply = replyForHook(report, parseHookInput(stdin));
      if (reply.stdout.length > 0) {
        process.stdout.write(reply.stdout);
      }
      if (reply.stderr.length > 0) {
        process.stderr.write(reply.stderr);
      }
      return reply.exitCode;
    }
    process.stdout.write(formatScanReport(report));
    return report.blocked ? 1 : 0;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "project scan failed";
    process.stderr.write(`${message}\n`);
    return 2;
  }
}

export function executeHooksCommand(args: readonly string[]): number {
  const parsed = parseHooksArgs(args);
  if (parsed === null) {
    process.stderr.write(
      "Usage: apex-skills hooks install [--root dir] [--global] [--home dir]\n",
    );
    return 2;
  }
  try {
    const files =
      parsed.scope === "global"
        ? installGlobalHooks(parsed.home)
        : installProjectHooks(parsed.root);
    process.stdout.write(`[Apex Scan] Hook installed: ${files.join(", ")}\n`);
    return 0;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "hook install failed";
    process.stderr.write(`${message}\n`);
    return 2;
  }
}

interface ParsedScanArgs {
  readonly root: string;
  readonly base: string | null;
  readonly hook: boolean;
}

function parseScanArgs(args: readonly string[], cwd: string): ParsedScanArgs | null {
  let root = cwd;
  let base: string | null = null;
  let hook = false;
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === "--hook") {
      hook = true;
      continue;
    }
    const value = args[index + 1];
    if (value === undefined || (flag !== "--root" && flag !== "--base")) {
      return null;
    }
    if (flag === "--root") {
      root = path.resolve(value);
    } else {
      base = value;
    }
    index += 1;
  }
  return { root, base, hook };
}

interface ParsedHooksArgs {
  readonly scope: "project" | "global";
  readonly root: string;
  readonly home: string;
}

function parseHooksArgs(args: readonly string[]): ParsedHooksArgs | null {
  if (args[0] !== "install") {
    return null;
  }
  let root = process.cwd();
  let home = homedir();
  let scope: ParsedHooksArgs["scope"] = "project";
  for (let index = 1; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === "--global") {
      scope = "global";
      continue;
    }
    const value = args[index + 1];
    if (value === undefined || (flag !== "--root" && flag !== "--home")) {
      return null;
    }
    if (flag === "--root") {
      root = path.resolve(value);
    } else {
      home = path.resolve(value);
    }
    index += 1;
  }
  return { scope, root, home };
}

function createDefaultIo(): ScanIo {
  return {
    cwd: process.cwd(),
    run(command: string, args: readonly string[], cwd: string): CommandResult {
      return runCommand(command, args, cwd);
    },
    commandExists(command: string): boolean {
      if (!/^[A-Za-z0-9.+_-]+$/.test(command)) {
        return false;
      }
      const result = runCommand("which", [command], process.cwd());
      return result.exitCode === 0;
    },
    readStdin(): string {
      if (process.stdin.isTTY) {
        return "";
      }
      return readFileSync(0, "utf8");
    },
  };
}

function runCommand(command: string, args: readonly string[], cwd: string): CommandResult {
  try {
    const stdout = execFileSync(command, [...args], {
      cwd,
      encoding: "utf8",
      timeout: 180_000,
      maxBuffer: 16 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { exitCode: 0, stdout, stderr: "" };
  } catch (error: unknown) {
    return {
      exitCode: readStatus(error),
      stdout: readPipe(error, "stdout"),
      stderr: readPipe(error, "stderr"),
    };
  }
}

function readStatus(error: unknown): number {
  if (!isRecord(error)) {
    return 1;
  }
  const status = error["status"];
  return typeof status === "number" ? status : 1;
}

function readPipe(error: unknown, key: "stdout" | "stderr"): string {
  if (!isRecord(error)) {
    return "";
  }
  const value = error[key];
  if (typeof value === "string") {
    return value;
  }
  if (Buffer.isBuffer(value)) {
    return value.toString("utf8");
  }
  return "";
}
