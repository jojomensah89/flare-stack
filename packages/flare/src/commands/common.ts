import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { getWorkerName, type ProjectContext } from "../project";
import {
  assertCommandSucceeded,
  type CommandRunner,
  type ManagedCommand,
  runManagedCommand,
  type RunOptions,
  type RunResult,
} from "../runner";

export type Output = Pick<Console, "log" | "error" | "warn">;
export type HealthFetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface CliDependencies {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  runner?: CommandRunner;
  output?: Output;
  fetcher?: HealthFetcher;
  promptLine?: (message: string) => Promise<string>;
  promptSecret?: (name: string) => Promise<string>;
  confirm?: (message: string) => Promise<boolean>;
}

export interface D1DatabaseRecord {
  name: string;
  id: string;
}

export interface MigrationState {
  pending: string[];
}

export function defaultPromptLine(message: string): Promise<string> {
  if (!process.stdin.isTTY) {
    throw new Error("This command needs an interactive terminal for its prompt.");
  }
  const reader = createInterface({ input: process.stdin, output: process.stdout });
  return reader.question(message).finally(() => reader.close());
}

export function defaultPromptSecret(name: string): Promise<string> {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
    throw new Error(`Cannot securely prompt for ${name} without an interactive terminal.`);
  }
  return new Promise((resolvePrompt, rejectPrompt) => {
    const stdin = process.stdin;
    let value = "";
    const previousEncoding = stdin.readableEncoding;
    const finish = (error?: Error) => {
      stdin.removeListener("data", onData);
      stdin.setRawMode(false);
      stdin.setEncoding(previousEncoding ?? "utf8");
      stdin.pause();
      process.stdout.write("\n");
      if (error) rejectPrompt(error);
      else resolvePrompt(value);
    };
    const onData = (chunk: string | Buffer) => {
      const characters = String(chunk);
      for (const character of characters) {
        if (character === "\u0003") {
          finish(new Error("Secret input was cancelled."));
          return;
        }
        if (character === "\r" || character === "\n") {
          finish();
          return;
        }
        if (character === "\u007f" || character === "\b") {
          value = value.slice(0, -1);
          continue;
        }
        value += character;
      }
    };

    process.stdout.write(`${name} (input hidden): `);
    stdin.setEncoding("utf8");
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}

export async function defaultConfirm(message: string): Promise<boolean> {
  const answer = (await defaultPromptLine(`${message} [y/N] `)).trim().toLowerCase();
  return answer === "y" || answer === "yes";
}

export function getOutput(deps: CliDependencies): Output {
  return deps.output ?? console;
}

export function getRunner(deps: CliDependencies): CommandRunner {
  return deps.runner ?? runManagedCommand;
}

export function getEnv(deps: CliDependencies): NodeJS.ProcessEnv {
  return deps.env ?? process.env;
}

export function makeEnv(
  deps: CliDependencies,
  updates: Record<string, string | undefined> = {},
): NodeJS.ProcessEnv {
  const env = { ...getEnv(deps) };
  for (const [name, value] of Object.entries(updates)) {
    if (value === undefined) delete env[name];
    else env[name] = value;
  }
  return env;
}

export function webDirectory(project: ProjectContext): string {
  return join(project.root, "apps", "web");
}

export function serverDirectory(project: ProjectContext): string {
  return join(project.root, "apps", "server");
}

export function runTool(
  deps: CliDependencies,
  command: ManagedCommand,
  args: string[],
  cwd: string,
  options: Partial<RunOptions> = {},
): RunResult {
  return getRunner(deps)(command, args, {
    cwd,
    env: options.env ?? getEnv(deps),
    ...(options.input === undefined ? {} : { input: options.input }),
    ...(options.maxBuffer === undefined ? {} : { maxBuffer: options.maxBuffer }),
  });
}

export function printCommandOutput(output: Output, result: RunResult): void {
  if (result.stdout.trim()) output.log(result.stdout.trimEnd());
  if (result.stderr.trim()) output.error(result.stderr.trimEnd());
}

export function withConfig(project: ProjectContext, args: string[]): string[] {
  return [...args, "--config", project.wranglerPath];
}

export function withBuiltDeploymentConfig(project: ProjectContext, args: string[]): string[] {
  const generatedConfig = join(webDirectory(project), ".wrangler", "deploy", "config.json");
  if (!existsSync(generatedConfig)) {
    throw new Error(
      `The Cloudflare Vite build did not create ${generatedConfig}; refusing to deploy the source config without its generated server entry point.`,
    );
  }
  let redirect: unknown;
  try {
    redirect = JSON.parse(readFileSync(generatedConfig, "utf8"));
  } catch {
    throw new Error(`The Cloudflare Vite deploy redirect at ${generatedConfig} is not valid JSON.`);
  }
  const configPath =
    redirect && typeof redirect === "object" && !Array.isArray(redirect)
      ? (redirect as Record<string, unknown>).configPath
      : undefined;
  if (typeof configPath !== "string" || !configPath.trim()) {
    throw new Error(`The Cloudflare Vite deploy redirect at ${generatedConfig} has no configPath.`);
  }
  const effectiveConfig = resolve(dirname(generatedConfig), configPath);
  const relativeConfig = relative(webDirectory(project), effectiveConfig);
  if (
    relativeConfig.startsWith("..") ||
    isAbsolute(relativeConfig) ||
    !existsSync(effectiveConfig)
  ) {
    throw new Error(
      `The Cloudflare Vite deploy config does not resolve to a built file inside apps/web: ${configPath}.`,
    );
  }
  let builtConfig: unknown;
  try {
    builtConfig = JSON.parse(readFileSync(effectiveConfig, "utf8"));
  } catch {
    throw new Error(`The Cloudflare Vite build config at ${effectiveConfig} is not valid JSON.`);
  }
  if (
    !builtConfig ||
    typeof builtConfig !== "object" ||
    Array.isArray(builtConfig) ||
    (builtConfig as Record<string, unknown>).name !== getWorkerName(project)
  ) {
    throw new Error(
      `The Cloudflare Vite build config must target Worker ${getWorkerName(project)}.`,
    );
  }
  // Wrangler follows the Vite plugin's .wrangler/deploy/config.json redirect when no --config is supplied.
  return args;
}

export function ensureProductionEnvironment(project: ProjectContext, deps: CliDependencies): void {
  const env = getEnv(deps);
  if (env.CLOUDFLARE_ENV !== undefined) {
    throw new Error(
      "Production commands require CLOUDFLARE_ENV to be unset. Remove it from the shell and retry.",
    );
  }
  const branch = env.WORKERS_CI_BRANCH;
  if (branch && branch !== project.config.productionBranch) {
    throw new Error(
      `Refusing production operation from WORKERS_CI_BRANCH=${branch}; expected ${project.config.productionBranch}.`,
    );
  }
}

export function expectOnlyFlags(
  args: string[],
  allowedFlags: string[],
  allowedPositionals = 0,
): string[] {
  const allowed = new Set(allowedFlags);
  const positionals: string[] = [];
  const booleanFlags = new Set([
    "--cloudflare-only",
    "--allow-destructive",
    "--remote",
    "--replace",
  ]);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) continue;
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      if (positionals.length > allowedPositionals) throw new Error(`Unexpected argument ${arg}.`);
      continue;
    }
    const name = arg.split("=", 1)[0] ?? "";
    if (!allowed.has(name)) throw new Error(`Unsupported option ${name}.`);
    if (booleanFlags.has(name) && arg.includes("=")) {
      throw new Error(`${name} is a flag and does not accept a value.`);
    }
    if (!arg.includes("=") && !booleanFlags.has(name)) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${name} requires a value.`);
      }
      index += 1;
    }
  }
  return positionals;
}

export function getOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index !== -1) return args[index + 1];
  const prefix = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  return inline?.slice(prefix.length);
}

export function hasOption(args: string[], name: string): boolean {
  return args.some((arg) => arg === name || arg.startsWith(`${name}=`));
}

export function parseJsonOutput(source: string, label: string): unknown {
  const trimmed = source.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const firstBrace = trimmed.indexOf("{");
    const firstBracket = trimmed.indexOf("[");
    const start =
      firstBrace !== -1 && firstBracket !== -1
        ? Math.min(firstBrace, firstBracket)
        : firstBrace !== -1
          ? firstBrace
          : firstBracket;
    const lastBrace = trimmed.lastIndexOf("}");
    const lastBracket = trimmed.lastIndexOf("]");
    const end = Math.max(lastBrace, lastBracket);

    if (start !== -1 && end !== -1 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        // Fall through to throw standard error
      }
    }

    throw new Error(
      `${label} returned output that was not valid JSON; refusing to infer remote state.`,
    );
  }
}

export function collectObjects(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value.flatMap((item) => collectObjects(item));
  if (!value || typeof value !== "object") return [];
  const current = value as Record<string, unknown>;
  const children = Object.values(current).flatMap((item) => collectObjects(item));
  return [current, ...children];
}

export function atomicWrite(file: string, contents: string): void {
  const temporary = join(dirname(file), `.${process.pid}.${randomBytes(8).toString("hex")}.tmp`);
  const mode = existsSync(file) ? statSync(file).mode & 0o777 : 0o600;
  try {
    writeFileSync(temporary, contents, { encoding: "utf8", flag: "wx", mode });
    renameSync(temporary, file);
  } catch (error) {
    try {
      unlinkSync(temporary);
    } catch {
      // Temporary file may not have been created or may already be moved.
    }
    throw error;
  }
}

export function clearCloudflareEnvironment(deps: CliDependencies): NodeJS.ProcessEnv {
  return makeEnv(deps, { CLOUDFLARE_ENV: undefined });
}

export async function runCheckAndBuild(
  project: ProjectContext,
  deps: CliDependencies,
  cloudflareOnly: boolean,
  environment: "production" | "preview",
): Promise<void> {
  const cloudflareEnv = makeEnv(deps, {
    CLOUDFLARE_ENV: undefined,
    FLARE_ENVIRONMENT: environment,
  });
  if (!cloudflareOnly) {
    const check = runTool(deps, "bun", ["run", "check"], project.root, { env: cloudflareEnv });
    printCommandOutput(getOutput(deps), check);
    assertCommandSucceeded(check, "bun run check");
  }
  const build = runTool(deps, "bun", ["run", "build"], project.root, { env: cloudflareEnv });
  printCommandOutput(getOutput(deps), build);
  assertCommandSucceeded(build, "bun run build");
}
