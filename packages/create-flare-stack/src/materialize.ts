import { cp, lstat, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { FLARE_VERSION, GenerationError, type ProjectPlan } from "./model";
import { DEFAULT_FLARE_RELEASE_URL } from "./release";

const TEXT_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsonc",
  ".md",
  ".mjs",
  ".sql",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);
const TEXT_FILENAMES = new Set([
  ".dev.vars.example",
  ".preview.vars.example",
  ".env.example",
  ".gitignore",
]);
const PACKAGE_SCAN_IGNORED_DIRECTORIES = new Set([
  "node_modules",
  ".git",
  ".turbo",
  "dist",
  ".output",
  ".wrangler",
]);

type TemplateValues = Record<string, string>;

function isInside(parentPath: string, childPath: string): boolean {
  const relativePath = relative(parentPath, childPath);
  return (
    relativePath === "" ||
    (!isAbsolute(relativePath) && relativePath !== ".." && !relativePath.startsWith(`..${sep}`))
  );
}

async function assertRegularTemplateTree(root: string, current = root): Promise<void> {
  const entries = await readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(current, entry.name);
    if (entry.isSymbolicLink()) {
      throw new GenerationError(
        "template validation",
        `Template contains a symbolic link: ${fullPath}`,
        "Remove symbolic links from the packaged template and publish a new generator release.",
      );
    }
    if (entry.isDirectory()) await assertRegularTemplateTree(root, fullPath);
    else if (!entry.isFile()) {
      throw new GenerationError(
        "template validation",
        `Template contains an unsupported filesystem entry: ${fullPath}`,
        "Remove the unsupported entry from the packaged template and publish a new generator release.",
      );
    }
  }
}

async function copyOverlay(source: string, destination: string): Promise<void> {
  const entries = await readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = join(source, entry.name);
    // Package managers omit .gitignore from published archives. Ship it under
    // a regular template filename and restore the generated project filename.
    const destinationPath = join(
      destination,
      entry.name === "gitignore" ? ".gitignore" : entry.name,
    );
    if (entry.isSymbolicLink()) {
      throw new GenerationError(
        "template copy",
        `Template contains a symbolic link: ${sourcePath}`,
        "Remove symbolic links from the template and publish a new generator release.",
      );
    }
    if (entry.isDirectory()) {
      await mkdir(destinationPath, { recursive: true });
      await copyOverlay(sourcePath, destinationPath);
    } else if (entry.isFile()) {
      await mkdir(dirname(destinationPath), { recursive: true });
      await cp(sourcePath, destinationPath, { force: true, errorOnExist: false });
    } else {
      throw new GenerationError(
        "template copy",
        `Template contains an unsupported filesystem entry: ${sourcePath}`,
        "Remove the unsupported entry from the template and publish a new generator release.",
      );
    }
  }
}

async function renderFiles(root: string, values: TemplateValues, current = root): Promise<void> {
  const entries = await readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) {
      await renderFiles(root, values, path);
      continue;
    }
    if (
      !entry.isFile() ||
      (!TEXT_EXTENSIONS.has(extname(entry.name)) && !TEXT_FILENAMES.has(entry.name))
    ) {
      continue;
    }
    const original = await readFile(path, "utf8");
    let rendered = original;
    rendered = rendered.replace(
      /\{\{\s*([A-Z][A-Z0-9_]*)\s*\}\}/g,
      (token, key: string) => values[key] ?? token,
    );
    if (/\{\{\s*[A-Z][A-Z0-9_]*\s*\}\}/.test(rendered)) {
      throw new GenerationError(
        "template rendering",
        `Unresolved template token in ${relative(root, path)}.`,
        "Update the template token map or remove the unrendered token before releasing this generator.",
      );
    }
    if (rendered !== original) await writeFile(path, rendered, "utf8");
  }
}

function resolveExpectedFlareDependency(plan: ProjectPlan): string {
  if (plan.options.flarePackagePath) {
    const isUrl =
      plan.options.flarePackagePath.startsWith("http://") ||
      plan.options.flarePackagePath.startsWith("https://");
    return isUrl
      ? plan.options.flarePackagePath
      : `file:${plan.options.flarePackagePath.replaceAll("\\", "/")}`;
  }
  return plan.releaseMetadata?.flareReleaseUrl ?? DEFAULT_FLARE_RELEASE_URL;
}

async function patchRootPackage(plan: ProjectPlan, destination: string): Promise<void> {
  const packagePath = join(destination, "package.json");
  let packageJson: Record<string, unknown>;
  try {
    packageJson = JSON.parse(await readFile(packagePath, "utf8")) as Record<string, unknown>;
  } catch (error) {
    throw new GenerationError(
      "template validation",
      `The selected template does not contain a valid root package.json: ${String(error)}`,
      "Fix the base template package.json and publish a new generator release.",
      { cause: error },
    );
  }

  packageJson.name = plan.options.projectName;
  const devDependencies = (packageJson.devDependencies ?? {}) as Record<string, string>;
  devDependencies.flare = resolveExpectedFlareDependency(plan);
  packageJson.devDependencies = devDependencies;
  await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
}

async function packageFiles(root: string, current = root): Promise<string[]> {
  const entries = await readdir(current, { withFileTypes: true });
  const found: string[] = [];
  for (const entry of entries) {
    const path = join(current, entry.name);
    if (entry.isDirectory() && !PACKAGE_SCAN_IGNORED_DIRECTORIES.has(entry.name)) {
      found.push(...(await packageFiles(root, path)));
    } else if (entry.isFile() && entry.name === "package.json") {
      found.push(path);
    }
  }
  return found;
}

async function assertPathAbsent(root: string, relativePath: string, reason: string): Promise<void> {
  try {
    await lstat(join(root, relativePath));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  throw new GenerationError(
    "generated project validation",
    `Unsupported ${reason} remains in the app preset at ${relativePath}.`,
    "Remove the unsupported preset files from the composed template before publishing it.",
  );
}

async function assertPathPresent(
  root: string,
  relativePath: string,
  reason: string,
): Promise<void> {
  if (await exists(join(root, relativePath))) return;
  throw new GenerationError(
    "generated project validation",
    `The selected ${reason} is missing at ${relativePath}.`,
    `Complete the selected profile overlay before advertising this option.`,
  );
}

export async function validateMaterializedProject(
  plan: ProjectPlan,
  destination: string,
): Promise<void> {
  const root = resolve(destination);
  const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as {
    name?: string;
    scripts?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  if (packageJson.name !== plan.options.projectName) {
    throw new GenerationError(
      "generated project validation",
      "The root package name does not match the destination name.",
      "Check the root package.json template and project-name rendering.",
    );
  }
  for (const script of ["setup", "check", "build"]) {
    if (!packageJson.scripts?.[script]) {
      throw new GenerationError(
        "generated project validation",
        `The root package.json is missing the required \`${script}\` script.`,
        "Add the required script to the curated app template before publishing it.",
      );
    }
  }
  const flareConfig = await readFile(join(root, "flare.config.ts"), "utf8").catch(() => "");
  const expectedConfig = [
    new RegExp(`\\bpreset\\s*:\\s*["']${plan.options.preset}["']`),
    new RegExp(`\\bflareVersion\\s*:\\s*["']${FLARE_VERSION.replaceAll(".", "\\.")}["']`),
    new RegExp(`\\bdatabase\\s*:\\s*["']${plan.options.database}["']`),
    new RegExp(`\\bauth\\s*:\\s*["']${plan.options.auth}["']`),
  ];
  if (expectedConfig.some((pattern) => !pattern.test(flareConfig))) {
    throw new GenerationError(
      "generated project validation",
      "flare.config.ts does not record the selected app, database, auth, and Flare version.",
      "Update the manifest template tokens so they match the selected project options.",
    );
  }
  const expectedFlare = resolveExpectedFlareDependency(plan);
  if (packageJson.devDependencies?.flare !== expectedFlare) {
    throw new GenerationError(
      "generated project validation",
      `Generated projects must pin flare to ${expectedFlare}.`,
      "Keep the lifecycle CLI version aligned with the generator release.",
    );
  }

  if (plan.options.preset === "app") {
    await assertPathAbsent(root, "apps/server", "dedicated Hono server");
  } else if (plan.options.preset === "worker") {
    await assertPathAbsent(root, "apps/web", "web application");
    await assertPathPresent(root, "apps/server", "dedicated Hono server");
    await assertPathPresent(root, "apps/server/src/index.ts", "Hono server entry point");
    await assertPathPresent(root, "apps/server/wrangler.jsonc", "Hono server Wrangler config");
  } else {
    await assertPathPresent(root, "apps/server", "dedicated Hono server");
    await assertPathPresent(root, "apps/server/src/index.ts", "Hono server entry point");
    await assertPathPresent(root, "apps/server/wrangler.jsonc", "Hono server Wrangler config");
    await assertPathPresent(root, "apps/web/src/lib/server-client.ts", "Server RPC client");
  }
  if (plan.options.database !== "neon") {
    await assertPathAbsent(root, "packages/db/src/neon", "Neon implementation");
    await assertPathAbsent(
      root,
      "packages/db/drizzle.neon.config.ts",
      "Neon Drizzle configuration",
    );
    await assertPathAbsent(
      root,
      "apps/web/src/server/auth.neon.ts",
      "Neon Better Auth integration",
    );
  } else {
    await assertPathPresent(root, "packages/db/src/neon", "Neon implementation");
    await assertPathPresent(
      root,
      "packages/db/drizzle.neon.config.ts",
      "Neon Drizzle configuration",
    );
  }
  const primaryWranglerPath =
    plan.options.preset === "worker"
      ? join(root, "apps", "server", "wrangler.jsonc")
      : join(root, "apps", "web", "wrangler.jsonc");
  const wranglerText = await readFile(primaryWranglerPath, "utf8");

  if (plan.options.database === "none") {
    await assertPathAbsent(root, "packages/db", "database package");
    const wranglerText = await readFile(join(root, "apps", "web", "wrangler.jsonc"), "utf8").catch(
      () => "",
    );
    if (wranglerText.includes("d1_databases")) {
      throw new GenerationError(
        "generated project validation",
        "The no-database app contains a Wrangler D1 binding.",
        "Move D1 configuration into the D1 overlay.",
      );
    }
    if (plan.options.preset === "fullstack") {
      const serverWranglerText = await readFile(
        join(root, "apps", "server", "wrangler.jsonc"),
        "utf8",
      ).catch(() => "");
      if (serverWranglerText.includes("d1_databases")) {
        throw new GenerationError(
          "generated project validation",
          "The no-database server contains a Wrangler D1 binding.",
          "Move D1 configuration into the D1 overlay.",
        );
      }
    }
  } else if (plan.options.database === "d1") {
    const dbPackage = join(root, "packages", "db", "package.json");
    if (!(await exists(dbPackage)) || !wranglerText.includes("d1_databases")) {
      throw new GenerationError(
        "generated project validation",
        "The D1 overlay is missing its Drizzle package or Wrangler D1 binding.",
        "Complete the D1 overlay before advertising `--db d1`.",
      );
    }
    if (plan.options.preset === "fullstack") {
      const serverWranglerPath = join(root, "apps", "server", "wrangler.jsonc");
      const serverWranglerText = await readFile(serverWranglerPath, "utf8").catch(() => "");
      if (!serverWranglerText.includes("d1_databases")) {
        throw new GenerationError(
          "generated project validation",
          "The fullstack D1 overlay is missing its Wrangler D1 binding on apps/server.",
          "Complete the D1 overlay for fullstack before advertising `--preset fullstack --db d1`.",
        );
      }
    }
  } else if (plan.options.database === "neon") {
    const dbPackage = join(root, "packages", "db", "package.json");
    if (!(await exists(dbPackage)) || wranglerText.includes("d1_databases")) {
      throw new GenerationError(
        "generated project validation",
        "The Neon overlay is missing its database package or incorrectly contains a Wrangler D1 binding.",
        "Complete the Neon overlay before advertising `--db neon`.",
      );
    }
    if (!wranglerText.includes("DATABASE_URL")) {
      throw new GenerationError(
        "generated project validation",
        "The Neon overlay must declare DATABASE_URL in secrets.required.",
        `Declare DATABASE_URL in ${plan.options.preset === "worker" ? "apps/server" : "apps/web"}/wrangler.jsonc secrets.required.`,
      );
    }
    await assertPathAbsent(root, "packages/db/src/schema", "D1 SQLite schema in Neon profile");
    await assertPathAbsent(root, "packages/db/migrations", "D1 SQLite migrations in Neon profile");
    await assertPathPresent(root, "packages/db/src/neon/schema/items.ts", "Neon items schema");
    await assertPathPresent(root, "packages/db/src/neon/schema/index.ts", "Neon index schema");
    await assertPathPresent(root, "packages/db/src/neon/migrations", "Neon migrations");
    if (plan.options.preset === "fullstack") {
      const serverWranglerPath = join(root, "apps", "server", "wrangler.jsonc");
      const serverWranglerText = await readFile(serverWranglerPath, "utf8").catch(() => "");
      if (
        serverWranglerText.includes("d1_databases") ||
        !serverWranglerText.includes("DATABASE_URL")
      ) {
        throw new GenerationError(
          "generated project validation",
          "The fullstack Neon overlay must declare DATABASE_URL on apps/server and must not contain D1 bindings.",
          "Declare DATABASE_URL in apps/server/wrangler.jsonc secrets.required.",
        );
      }
    }
  }

  if (plan.options.auth === "none") {
    await assertPathAbsent(root, "apps/web/src/server/auth.ts", "Better Auth integration");
    await assertPathAbsent(root, "apps/web/src/server/auth-config.ts", "Better Auth configuration");
    await assertPathAbsent(root, "apps/web/src/server/session.ts", "Better Auth session helper");
    await assertPathAbsent(root, "apps/web/src/lib/auth-client.ts", "Better Auth client");
    await assertPathAbsent(root, "apps/web/src/routes/api/auth", "Better Auth route");
    await assertPathAbsent(root, "packages/db/src/schema/auth.ts", "Better Auth schema");
    await assertPathAbsent(root, "packages/db/src/neon/schema/auth.ts", "Better Auth Neon schema");
    if (plan.options.database !== "neon") {
      await assertPathAbsent(
        root,
        "apps/web/.preview.vars.example",
        "Better Auth Preview secret example",
      );
    } else {
      const previewExamplePath =
        plan.options.preset === "worker"
          ? "apps/server/.preview.vars.example"
          : "apps/web/.preview.vars.example";
      await assertPathPresent(root, previewExamplePath, "Neon Preview database secret example");
      const previewExample = await readFile(join(root, previewExamplePath), "utf8");
      if (!/^DATABASE_URL\s*=/m.test(previewExample)) {
        throw new GenerationError(
          "generated project validation",
          `${previewExamplePath} is missing the required DATABASE_URL entry.`,
          "Declare DATABASE_URL in .preview.vars.example.",
        );
      }
      if (/^BETTER_AUTH_SECRET\s*=/m.test(previewExample)) {
        throw new GenerationError(
          "generated project validation",
          `${previewExamplePath} should not contain BETTER_AUTH_SECRET when auth is none.`,
          "Remove BETTER_AUTH_SECRET when auth is none.",
        );
      }
    }
    if (plan.options.preset === "fullstack") {
      await assertPathAbsent(root, "apps/server/src/routes/auth.ts", "Server Better Auth routes");
    }
  } else {
    const authSchemaPath =
      plan.options.database === "neon"
        ? "packages/db/src/neon/schema/auth.ts"
        : "packages/db/src/schema/auth.ts";
    for (const relativePath of [
      "apps/web/src/server/auth.ts",
      "apps/web/src/server/auth-config.ts",
      "apps/web/src/server/session.ts",
      "apps/web/src/lib/auth-client.ts",
      "apps/web/src/routes/api/auth",
      authSchemaPath,
      "apps/web/.dev.vars.example",
      "apps/web/.preview.vars.example",
    ]) {
      await assertPathPresent(root, relativePath, "Better Auth integration");
    }

    const requiredSecretDeclarations =
      wranglerText.match(/"required"\s*:\s*\[[\s\S]*?"BETTER_AUTH_SECRET"[\s\S]*?\]/g) ?? [];
    if (requiredSecretDeclarations.length !== 3) {
      throw new GenerationError(
        "generated project validation",
        "Better Auth must declare BETTER_AUTH_SECRET at the top level and in development and Preview environments.",
        "Keep the Wrangler required-secret declarations aligned across production, development, and Preview.",
      );
    }

    for (const examplePath of ["apps/web/.dev.vars.example", "apps/web/.preview.vars.example"]) {
      const example = await readFile(join(root, examplePath), "utf8");
      if (!/^BETTER_AUTH_SECRET\s*=/m.test(example)) {
        throw new GenerationError(
          "generated project validation",
          `${examplePath} is missing the required BETTER_AUTH_SECRET entry.`,
          "Keep the local environment examples aligned with the Wrangler required-secret declarations.",
        );
      }
      if (plan.options.database === "neon" && !/^DATABASE_URL\s*=/m.test(example)) {
        throw new GenerationError(
          "generated project validation",
          `${examplePath} is missing the required DATABASE_URL entry for Neon.`,
          "Keep DATABASE_URL in environment examples for Neon.",
        );
      }
    }

    if (plan.options.preset === "fullstack") {
      await assertPathPresent(root, "apps/server/src/routes/auth.ts", "Server Better Auth routes");
      await assertPathPresent(root, "apps/server/.dev.vars.example", "Server dev vars example");
      const serverWranglerText = await readFile(
        join(root, "apps", "server", "wrangler.jsonc"),
        "utf8",
      );
      const serverSecretDeclarations =
        serverWranglerText.match(/"required"\s*:\s*\[[\s\S]*?"BETTER_AUTH_SECRET"[\s\S]*?\]/g) ??
        [];
      if (serverSecretDeclarations.length !== 3) {
        throw new GenerationError(
          "generated project validation",
          "apps/server must declare BETTER_AUTH_SECRET at the top level and in development and Preview environments.",
          "Keep Wrangler required-secret declarations aligned across production, development, and Preview.",
        );
      }
    }
  }

  let hasBetterAuthDependency = false;
  for (const path of await packageFiles(root)) {
    const manifest = JSON.parse(await readFile(path, "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const names = [
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.devDependencies ?? {}),
    ];
    if (names.includes("hono") || names.includes("@repo/server")) {
      if (plan.options.preset === "app") {
        throw new GenerationError(
          "generated project validation",
          `The app preset contains a Hono server dependency in ${relative(root, path)}.`,
          "Remove fullstack-only dependencies from the app template.",
        );
      }
    }
    if (
      names.includes("@neondatabase/serverless") ||
      names.some((name) => name.includes("neon-serverless"))
    ) {
      if (plan.options.database !== "neon") {
        throw new GenerationError(
          "generated project validation",
          `The generated app contains a Neon runtime dependency in ${relative(root, path)}.`,
          "Remove Neon packages from non-Neon overlays.",
        );
      }
    }
    if (plan.options.auth === "none" && names.includes("better-auth")) {
      throw new GenerationError(
        "generated project validation",
        `Better Auth is present even though auth was not selected (${relative(root, path)}).`,
        "Move Better Auth dependencies and files into the auth overlay.",
      );
    }
    if (names.includes("better-auth")) hasBetterAuthDependency = true;
  }
  if (plan.options.auth === "better-auth" && !hasBetterAuthDependency) {
    throw new GenerationError(
      "generated project validation",
      "The Better Auth overlay is missing the better-auth package dependency.",
      "Add the pinned Better Auth dependency to the auth overlay.",
    );
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export async function materializeProject(
  plan: ProjectPlan,
  destination: string,
  templateRoot: string,
): Promise<void> {
  const root = resolve(templateRoot);
  const target = resolve(destination);
  if (isInside(root, target) || isInside(target, root)) {
    throw new GenerationError(
      "template validation",
      "The template destination overlaps the packaged template directory.",
      "Choose a destination outside the generator's template directory.",
    );
  }
  try {
    await assertRegularTemplateTree(root);
  } catch (error) {
    if (error instanceof GenerationError) throw error;
    throw new GenerationError(
      "template validation",
      `Could not read packaged templates: ${String(error)}`,
      "Reinstall the generator package or publish a complete templates directory.",
      { cause: error },
    );
  }

  const values: TemplateValues = {
    PROJECT_NAME: plan.options.projectName,
    FLARE_VERSION,
    PRESET: plan.options.preset,
    DATABASE: plan.options.database,
    AUTH: plan.options.auth,
    DB_ENABLED: String(plan.options.database !== "none"),
    AUTH_ENABLED: String(plan.options.auth !== "none"),
  };
  for (const layer of plan.templateLayers) {
    const source = resolve(root, layer);
    if (!isInside(root, source)) {
      throw new GenerationError(
        "template validation",
        `Invalid template layer: ${layer}`,
        "Repair the generator layer map.",
      );
    }
    try {
      const stat = await lstat(source);
      if (!stat.isDirectory()) throw new Error("not a directory");
      await mkdir(target, { recursive: true });
      await copyOverlay(source, target);
    } catch (error) {
      if (error instanceof GenerationError) throw error;
      throw new GenerationError(
        "template copy",
        `Required template layer \`${layer}\` is missing or unreadable: ${String(error)}`,
        `Restore templates/${FLARE_VERSION}/${layer} in the package and publish a complete generator release.`,
        { cause: error },
      );
    }
  }

  if (plan.options.database === "neon") {
    await rm(join(target, "packages", "db", "src", "schema"), { recursive: true, force: true });
    await rm(join(target, "packages", "db", "migrations"), { recursive: true, force: true });
  }

  if (plan.options.preset === "worker") {
    await rm(join(target, "apps", "web"), { recursive: true, force: true });
  }

  await renderFiles(target, values);
  await patchRootPackage(plan, target);
  await validateMaterializedProject(plan, target);
}
