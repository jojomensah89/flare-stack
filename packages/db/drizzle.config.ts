import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { defineConfig } from "drizzle-kit";

const currentDir =
  typeof import.meta.url === "string" ? dirname(fileURLToPath(import.meta.url)) : process.cwd();

function toFileUrl(filePath: string): string {
  if (filePath.startsWith("file:")) return filePath;
  const normalized = filePath.replace(/\\/g, "/");
  return `file:${normalized}`;
}

function getLocalD1Path(): string | undefined {
  if (process.env.LOCAL_DB_PATH) return toFileUrl(process.env.LOCAL_DB_PATH);
  const candidates = [
    resolve(process.cwd(), "../../.wrangler/state/v3/d1/miniflare-D1DatabaseObject"),
    resolve(process.cwd(), "../.wrangler/state/v3/d1/miniflare-D1DatabaseObject"),
    resolve(process.cwd(), ".wrangler/state/v3/d1/miniflare-D1DatabaseObject"),
    resolve(currentDir, "../../.wrangler/state/v3/d1/miniflare-D1DatabaseObject"),
  ];
  for (const dir of candidates) {
    if (existsSync(dir)) {
      try {
        const files = readdirSync(dir)
          .filter((f) => f.endsWith(".sqlite") && f !== "metadata.sqlite")
          .map((f) => ({ path: join(dir, f), mtime: statSync(join(dir, f)).mtimeMs }))
          .sort((a, b) => b.mtime - a.mtime);
        if (files[0]?.path) return toFileUrl(files[0].path);
      } catch {
        // Continue
      }
    }
  }
  return undefined;
}

const localDbUrl = getLocalD1Path();

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dialect: "sqlite",
  ...(localDbUrl ? { dbCredentials: { url: localDbUrl } } : {}),
});
