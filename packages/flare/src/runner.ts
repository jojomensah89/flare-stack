import { spawnSync } from "node:child_process";

export type ManagedCommand = "bun" | "wrangler";

export interface RunOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  input?: string;
  maxBuffer?: number;
}

export interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
}

export type CommandRunner = (
  command: ManagedCommand,
  args: string[],
  options: RunOptions,
) => RunResult;

/**
 * Run installed project tools through the active Bun executable. `--no-install`
 * prevents lifecycle commands from silently downloading tools that are absent
 * from the generated project's lockfile.
 */
export const runManagedCommand: CommandRunner = (command, args, options) => {
  const invocation = command === "wrangler" ? ["x", "--no-install", "wrangler", ...args] : args;
  const result = spawnSync(process.execPath, invocation, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    input: options.input,
    encoding: "utf8",
    shell: false,
    maxBuffer: options.maxBuffer ?? 16 * 1024 * 1024,
    windowsHide: true,
  });

  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    ...(result.error ? { error: result.error } : {}),
  };
};

export function commandError(result: RunResult, label: string): Error {
  const detail = result.error?.message ?? result.stderr.trim() ?? "";
  const suffix = detail ? `: ${detail}` : "";
  return new Error(
    `${label} failed${result.status === null ? " to start" : ` (exit ${result.status})`}${suffix}`,
  );
}

export function assertCommandSucceeded(result: RunResult, label: string): void {
  if (result.status !== 0) throw commandError(result, label);
}
