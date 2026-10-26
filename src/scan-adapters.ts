import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { isRecord } from "./json-record.js";
import type { ScanCheck, ScanIo } from "./scan-model.js";

interface Adapter {
  readonly id: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly config: string;
}

const ADAPTERS: readonly Adapter[] = [
  {
    id: "sonar-scanner",
    command: "sonar-scanner",
    args: [],
    config: "sonar-project.properties",
  },
  {
    id: "gitleaks",
    command: "gitleaks",
    args: ["detect", "--no-banner", "--redact"],
    config: ".gitleaks.toml",
  },
];

export function evaluateAdapters(root: string, io: ScanIo): ScanCheck {
  const requested = readRequestedAdapters(root);
  if (requested === null) {
    return {
      id: "adapter",
      status: "fail",
      summary: ".apex/scan.json must be a JSON object with an adapters array.",
    };
  }
  const unknown = requested.filter((id) => !ADAPTERS.some((adapter) => adapter.id === id));
  if (unknown.length > 0) {
    return {
      id: "adapter",
      status: "fail",
      summary: `Unknown adapter ${unknown.join(", ")}. Known adapters: sonar-scanner, gitleaks.`,
    };
  }
  const selected = ADAPTERS.filter(
    (adapter) =>
      requested.includes(adapter.id) || existsSync(path.join(root, adapter.config)),
  );
  if (selected.length === 0) {
    return {
      id: "adapter",
      status: "pass",
      summary: "No SonarQube or gitleaks adapter is configured.",
    };
  }
  const failures: string[] = [];
  for (const adapter of selected) {
    if (!io.commandExists(adapter.command)) {
      failures.push(
        `${adapter.id} is configured and the ${adapter.command} binary is not on PATH.`,
      );
      continue;
    }
    const result = io.run(adapter.command, adapter.args, root);
    if (result.exitCode !== 0) {
      failures.push(`${adapter.id} exited ${result.exitCode}.`);
    }
  }
  if (failures.length > 0) {
    return { id: "adapter", status: "fail", summary: failures.join(" ") };
  }
  return {
    id: "adapter",
    status: "pass",
    summary: `Adapter checks passed: ${selected.map((adapter) => adapter.id).join(", ")}.`,
  };
}

function readRequestedAdapters(root: string): readonly string[] | null {
  const file = path.join(root, ".apex", "scan.json");
  if (!existsSync(file)) {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8")) as unknown;
  } catch {
    return null;
  }
  if (!isRecord(parsed) || !Array.isArray(parsed["adapters"])) {
    return null;
  }
  return parsed["adapters"].filter((entry): entry is string => typeof entry === "string");
}
