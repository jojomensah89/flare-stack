import { spawnSync } from "node:child_process";
import { extname } from "node:path";

const staged = spawnSync("git", ["diff", "--cached", "--name-only", "-z", "--diff-filter=ACMR"], {
  encoding: "utf8",
  shell: false,
});

if (staged.error) throw staged.error;
if (staged.status !== 0) {
  console.error(staged.stderr || "Could not read staged paths from Git.");
  process.exit(staged.status ?? 1);
}

const paths = staged.stdout.split("\0").filter(Boolean);
const formatExtensions = new Set([
  ".cjs",
  ".css",
  ".html",
  ".js",
  ".jsx",
  ".json",
  ".json5",
  ".jsonc",
  ".md",
  ".mdx",
  ".mjs",
  ".toml",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml",
]);
const lintExtensions = new Set([".cjs", ".cts", ".js", ".jsx", ".mjs", ".mts", ".ts", ".tsx"]);
const formatPaths = paths.filter((path) => formatExtensions.has(extname(path).toLowerCase()));
const lintPaths = paths.filter(
  (path) =>
    lintExtensions.has(extname(path).toLowerCase()) &&
    !path.replaceAll("\\", "/").includes("packages/create-flare-stack/templates/"),
);

function runTool(name: string, args: string[]): void {
  const result = spawnSync(process.execPath, ["run", name, ...args], {
    shell: false,
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (formatPaths.length > 0) runTool("oxfmt", ["--check", ...formatPaths]);
if (lintPaths.length > 0) runTool("oxlint", ["--deny-warnings", ...lintPaths]);
