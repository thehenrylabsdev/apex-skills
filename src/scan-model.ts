export type ScanCheckId = "reuse" | "secrets" | "cve" | "adapter";

export type ScanCheckStatus = "pass" | "fail" | "unavailable";

export interface ScanCheck {
  readonly id: ScanCheckId;
  readonly status: ScanCheckStatus;
  readonly summary: string;
}

export interface ScanReport {
  readonly checks: readonly ScanCheck[];
  readonly blocked: boolean;
}

export interface AddedLine {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

export interface SecretFinding {
  readonly file: string;
  readonly line: number;
  readonly pattern: string;
}

export interface CommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface ScanIo {
  readonly cwd: string;
  run(command: string, args: readonly string[], cwd: string): CommandResult;
  commandExists(command: string): boolean;
  readStdin(): string;
}

export interface HookReply {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}
