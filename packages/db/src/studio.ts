import { spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const currentDir =
  typeof import.meta.url === "string" ? dirname(fileURLToPath(import.meta.url)) : process.cwd();
const dbPackageDir = resolve(currentDir, "..");
const projectRoot = resolve(dbPackageDir, "../..");

function readEnvVarFromFile(filePath: string, varName: string): string | undefined {
  if (!existsSync(filePath)) return undefined;
  const content = readFileSync(filePath, "utf8");
  const regex = new RegExp(`^${varName}=["']?([^"'\\r\\n]+)["']?`, "m");
  const match = content.match(regex);
  return match?.[1];
}

function resolveNeonDatabaseUrl(): string | undefined {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const candidateFiles = [
    join(projectRoot, "apps", "web", ".dev.vars"),
    join(projectRoot, "apps", "server", ".dev.vars"),
    join(projectRoot, ".test-sandboxes", ".neon-env"),
    join(projectRoot, ".env"),
  ];
  for (const file of candidateFiles) {
    const url = readEnvVarFromFile(file, "DATABASE_URL");
    if (url) return url;
  }
  return undefined;
}

function resolveLocalD1SqlitePath(): string | undefined {
  if (process.env.LOCAL_DB_PATH) return process.env.LOCAL_DB_PATH;
  const stateDirs = [
    join(projectRoot, ".wrangler", "state", "v3", "d1", "miniflare-D1DatabaseObject"),
    join(
      projectRoot,
      "apps",
      "web",
      ".wrangler",
      "state",
      "v3",
      "d1",
      "miniflare-D1DatabaseObject",
    ),
    join(
      projectRoot,
      "apps",
      "server",
      ".wrangler",
      "state",
      "v3",
      "d1",
      "miniflare-D1DatabaseObject",
    ),
  ];
  for (const dir of stateDirs) {
    if (existsSync(dir)) {
      try {
        const files = readdirSync(dir)
          .filter((f) => f.endsWith(".sqlite") && f !== "metadata.sqlite")
          .map((f) => ({ path: join(dir, f), mtime: statSync(join(dir, f)).mtimeMs }))
          .sort((a, b) => b.mtime - a.mtime);
        if (files[0]?.path) return files[0].path;
      } catch {
        // continue
      }
    }
  }
  return undefined;
}

export function launchStudio(extraArgs: string[] = []): void {
  // Determine if Neon or D1
  const isNeon =
    existsSync(join(dbPackageDir, "drizzle.neon.config.ts")) &&
    (Boolean(process.env.DATABASE_URL) ||
      Boolean(readEnvVarFromFile(join(projectRoot, "flare.config.ts"), "neon")) ||
      existsSync(join(projectRoot, ".test-sandboxes", ".neon-env")));

  const env = { ...process.env };
  let configFile = "drizzle.config.ts";

  if (isNeon) {
    configFile = "drizzle.neon.config.ts";
    const databaseUrl = resolveNeonDatabaseUrl();
    if (!databaseUrl) {
      console.error(
        "Error: DATABASE_URL is required to run Drizzle Studio with Neon. Define it in .dev.vars or environment.",
      );
      process.exit(1);
    }
    env.DATABASE_URL = databaseUrl;
  } else {
    configFile = "drizzle.config.ts";
    const localDbPath = resolveLocalD1SqlitePath();
    if (!localDbPath) {
      console.error(
        "Error: No local D1 database file found in .wrangler/state.\nRun `bun dev` or `bun db:migrate` first to initialize local database state.",
      );
      process.exit(1);
    }
    const normalized = localDbPath.replace(/\\/g, "/");
    env.LOCAL_DB_PATH = `file:${normalized}`;
  }

  const child = spawn(
    process.execPath,
    ["x", "drizzle-kit", "studio", "--config", configFile, ...extraArgs],
    {
      cwd: dbPackageDir,
      env,
      stdio: "inherit",
    },
  );

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });
}

if (import.meta.main) {
  const extraArgs = process.argv.slice(2);
  launchStudio(extraArgs);
}
