/**
 * Browser-safe catalog shared by the CLI and the Flare Stack preset builder.
 * Keep this module free of Node, Bun, filesystem, and environment imports.
 */

export type CatalogPreset = "app" | "fullstack" | "worker" | "extension";
export type CatalogFrontend = "start" | "router";
export type CatalogDatabase = "none" | "d1" | "neon";
export type CatalogAuth = "none" | "better-auth";
export type CatalogBackend =
  | "start-functions"
  | "effect-http"
  | "hono-rpc"
  | "hono-worker"
  | "none";

export interface CatalogSelection {
  preset: CatalogPreset;
  frontend?: CatalogFrontend;
  database?: CatalogDatabase;
  auth?: CatalogAuth;
}

export interface NormalizedCatalogSelection {
  preset: CatalogPreset;
  /** Defined only for fullstack; omitted fullstack choices normalize to Start. */
  frontend?: CatalogFrontend;
  database: CatalogDatabase;
  auth: CatalogAuth;
}

export interface CatalogStack {
  runtime: string;
  frontend: string;
  backend: string;
  database: string;
  authentication: string;
  tooling: readonly string[];
}

export interface CatalogEntry {
  /** Stable ID: preset:frontend-or-none:database:auth. */
  id: string;
  label: string;
  selection: NormalizedCatalogSelection;
  backend: CatalogBackend;
  stack: CatalogStack;
}

export interface CatalogReleaseCombination {
  id: string;
  backend: CatalogBackend;
}

/**
 * A release manifest must be obtained and checked by its consumer before it is
 * passed here. The builder still validates URLs and requires an exact accepted
 * combination so it cannot invent a command when the manifest is absent.
 */
export interface CatalogReleaseManifest {
  version: string;
  generatorArchiveUrl: string;
  flareCliVersion: string;
  flareArchiveUrl?: string;
  generatorSha256?: string;
  flareSha256?: string;
  acceptedCombinations: readonly CatalogReleaseCombination[];
}

export type ScaffoldCommandSource =
  | { mode: "local" }
  | { mode: "release"; manifest?: CatalogReleaseManifest | null };

export interface ScaffoldCommandResult {
  available: boolean;
  command?: string;
  reason?: string;
  selection?: NormalizedCatalogSelection;
  backend?: CatalogBackend;
}

export interface CatalogProjectNameValidation {
  valid: boolean;
  message?: string;
}

const RESERVED_WINDOWS_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

export function validateCatalogProjectName(
  name: string,
  preset?: CatalogPreset,
): CatalogProjectNameValidation {
  const maxLength = preset === "fullstack" || preset === "worker" ? 48 : 58;
  if (name.length < 1 || name.length > maxLength) {
    return {
      valid: false,
      message: `Project name must be between 1 and ${maxLength} characters so generated Worker names stay within Cloudflare's 63-character limit.`,
    };
  }
  if (name !== name.toLowerCase()) {
    return { valid: false, message: "Use a lowercase project name." };
  }
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(name)) {
    return {
      valid: false,
      message:
        "Project name may contain lowercase letters, numbers, and hyphens; it must start and end with a letter or number.",
    };
  }
  if (RESERVED_WINDOWS_NAMES.test(name)) {
    return { valid: false, message: `Project name \`${name}\` is reserved on Windows.` };
  }
  return { valid: true };
}

export function normalizeSelection(input: CatalogSelection): NormalizedCatalogSelection {
  const preset = input.preset;
  if (preset !== "app" && preset !== "fullstack" && preset !== "worker" && preset !== "extension") {
    throw new TypeError("Choose app, fullstack, worker, or extension.");
  }

  const database = input.database ?? "none";
  if (database !== "none" && database !== "d1" && database !== "neon") {
    throw new TypeError("Choose none, d1, or neon for the database.");
  }

  const auth = input.auth ?? "none";
  if (auth !== "none" && auth !== "better-auth") {
    throw new TypeError("Choose none or better-auth for authentication.");
  }

  if (input.frontend !== undefined && preset !== "fullstack") {
    throw new TypeError("Frontend selection is available only for the fullstack preset.");
  }
  if (input.frontend !== undefined && input.frontend !== "start" && input.frontend !== "router") {
    throw new TypeError("Choose start or router for the fullstack frontend.");
  }
  if (preset === "worker" && auth === "better-auth") {
    throw new TypeError("Worker does not support Better Auth session cookies.");
  }
  if (preset === "extension" && (database !== "none" || auth !== "none")) {
    throw new TypeError("Extension supports only database none and authentication none.");
  }
  if (auth === "better-auth" && database === "none") {
    throw new TypeError("Better Auth requires D1 or Neon.");
  }

  return {
    preset,
    ...(preset === "fullstack" ? { frontend: input.frontend ?? "start" } : {}),
    database,
    auth,
  };
}

function selectionId(selection: NormalizedCatalogSelection): string {
  return [
    selection.preset,
    selection.frontend ?? (selection.preset === "app" ? "start" : "none"),
    selection.database,
    selection.auth,
  ].join(":");
}

function databaseLabel(database: CatalogDatabase): string {
  if (database === "d1") return "D1 + Drizzle";
  if (database === "neon") return "Neon + Drizzle";
  return "No database";
}

function authLabel(auth: CatalogAuth): string {
  return auth === "better-auth" ? "Better Auth" : "No authentication";
}

function makeEntry(selection: NormalizedCatalogSelection): CatalogEntry {
  const frontend = selection.preset === "app" ? "start" : selection.frontend;
  const backend: CatalogBackend =
    selection.preset === "app"
      ? "start-functions"
      : selection.preset === "fullstack"
        ? "effect-http"
        : selection.preset === "worker"
          ? "hono-worker"
          : "none";
  const frontendLabel =
    selection.preset === "app"
      ? "React + TanStack Start"
      : selection.preset === "fullstack" && frontend === "router"
        ? "React + Vite + TanStack Router + TanStack Query"
        : selection.preset === "fullstack"
          ? "React + TanStack Start + TanStack Query"
          : selection.preset === "worker"
            ? "No frontend"
            : "WXT + React + Tailwind";
  const backendLabel =
    backend === "start-functions"
      ? "TanStack Start server functions and routes"
      : backend === "effect-http"
        ? "Hono HTTP routes + Effect services"
        : backend === "hono-worker"
          ? "Standalone Hono Worker"
          : "No backend";
  const database = databaseLabel(selection.database);
  const authentication = authLabel(selection.auth);
  const label = [
    selection.preset,
    frontend === "router" ? "Router" : undefined,
    selection.database,
    selection.auth === "better-auth" ? "Better Auth" : undefined,
  ]
    .filter(Boolean)
    .join(" · ");

  const tooling =
    selection.preset === "extension"
      ? ["Bun", "WXT", "React", "Tailwind CSS v4", "Chrome, Firefox, and Edge packaging"]
      : selection.preset === "worker"
        ? ["Bun", "Flare CLI", ...(selection.database === "none" ? [] : ["Drizzle ORM"])]
        : [
            "Bun",
            "Flare CLI",
            "React",
            ...(selection.preset === "fullstack" ? ["TanStack Query"] : []),
            ...(selection.database === "none" ? [] : ["Drizzle ORM"]),
            "Tailwind CSS v4",
            "Base UI",
            ...(selection.auth === "better-auth" ? ["Better Auth"] : []),
          ];

  return {
    id: selectionId(selection),
    label,
    selection,
    backend,
    stack: {
      runtime: selection.preset === "extension" ? "Browser extension" : "Cloudflare Workers",
      frontend: frontendLabel,
      backend: backendLabel,
      database,
      authentication,
      tooling,
    },
  };
}

function selectionsFor(preset: "app" | "fullstack", frontend?: CatalogFrontend): CatalogEntry[] {
  const selections: NormalizedCatalogSelection[] = [
    { preset, ...(frontend ? { frontend } : {}), database: "none", auth: "none" },
    { preset, ...(frontend ? { frontend } : {}), database: "d1", auth: "none" },
    { preset, ...(frontend ? { frontend } : {}), database: "d1", auth: "better-auth" },
    { preset, ...(frontend ? { frontend } : {}), database: "neon", auth: "none" },
    { preset, ...(frontend ? { frontend } : {}), database: "neon", auth: "better-auth" },
  ];
  return selections.map(makeEntry);
}

const fullstackRows = [
  ...selectionsFor("fullstack", "start"),
  ...selectionsFor("fullstack", "router"),
];
const workerRows = (["none", "d1", "neon"] as const).map((database) =>
  makeEntry({ preset: "worker", database, auth: "none" }),
);

/** The 19 supported source combinations; order is stable for the website. */
export const PRESET_CATALOG: readonly CatalogEntry[] = Object.freeze([
  ...selectionsFor("app"),
  ...fullstackRows,
  ...workerRows,
  makeEntry({ preset: "extension", database: "none", auth: "none" }),
]);

/** The inspected published v0.14.1 archives support exactly these three rows. */
export const VERIFIED_V0141_RELEASE_MANIFEST: CatalogReleaseManifest = Object.freeze({
  version: "0.14.1",
  generatorArchiveUrl:
    "https://github.com/jojomensah89/flare-stack/releases/download/v0.14.1/create-flare-stack-0.14.1.tgz",
  flareArchiveUrl:
    "https://github.com/jojomensah89/flare-stack/releases/download/v0.14.1/flare-0.14.1.tgz",
  flareCliVersion: "0.14.1",
  generatorSha256: "a3270c2b1b3dbc30835edebe1d6f657bca41a85f4058c6eecb5f2defe21c3b80",
  flareSha256: "b92274239b5839c70c9a4df47e7b9ce805678c7bc0e0c890abaecd80e6ce6fa7",
  acceptedCombinations: Object.freeze([
    { id: "app:start:none:none", backend: "start-functions" },
    { id: "app:start:d1:none", backend: "start-functions" },
    { id: "app:start:d1:better-auth", backend: "start-functions" },
  ] satisfies readonly CatalogReleaseCombination[]),
});

function shellQuote(value: string): string {
  // Accepted project names contain only letters, digits, and hyphens.
  return value;
}

function commandArguments(selection: NormalizedCatalogSelection): string[] {
  const args = ["--preset", selection.preset];
  if (selection.preset === "fullstack" && selection.frontend === "router") {
    args.push("--frontend", "router");
  }
  args.push("--db", selection.database);
  if (selection.auth === "better-auth") args.push("--auth");
  return args;
}

export function buildScaffoldCommand(
  input: CatalogSelection,
  projectName: string,
  source: ScaffoldCommandSource,
): ScaffoldCommandResult {
  let selection: NormalizedCatalogSelection;
  try {
    selection = normalizeSelection(input);
  } catch (error) {
    return {
      available: false,
      reason: error instanceof Error ? error.message : "This selection is not supported.",
    };
  }

  const nameValidation = validateCatalogProjectName(projectName, selection.preset);
  if (!nameValidation.valid) {
    return { available: false, reason: nameValidation.message, selection };
  }

  const entry = PRESET_CATALOG.find((candidate) => candidate.id === selectionId(selection));
  if (!entry) {
    return {
      available: false,
      reason: "This stack combination is not in the supported catalog.",
      selection,
    };
  }

  const commandParts = commandArguments(selection).map(shellQuote);
  if (source.mode === "local") {
    const command = [
      "bun",
      "./packages/create-flare-stack/bin/create-flare-stack.ts",
      projectName,
      ...commandParts,
      "--flare-package",
      "./packages/flare",
    ].join(" ");
    return { available: true, command, selection, backend: entry.backend };
  }

  const manifest = source.manifest;
  if (!manifest) {
    return {
      available: false,
      reason:
        "No verified compatible generator release is available. Try again when a compatible release is published.",
      selection,
    };
  }
  if (
    !manifest.version ||
    !manifest.flareCliVersion ||
    manifest.version !== manifest.flareCliVersion
  ) {
    return {
      available: false,
      reason: "The generator and Flare CLI versions in the release manifest do not match.",
      selection,
    };
  }
  let archiveUrl: URL;
  try {
    archiveUrl = new URL(manifest.generatorArchiveUrl);
  } catch {
    return {
      available: false,
      reason: "The release manifest has an invalid generator archive URL.",
      selection,
    };
  }
  if (
    archiveUrl.protocol !== "https:" ||
    !archiveUrl.pathname.endsWith(".tgz") ||
    archiveUrl.username ||
    archiveUrl.password ||
    !/^https:\/\/[A-Za-z0-9._~:/-]+\.tgz$/.test(archiveUrl.toString())
  ) {
    return {
      available: false,
      reason:
        "The release manifest must point to a shell-safe HTTPS generator .tgz archive without credentials or query parameters.",
      selection,
    };
  }
  const accepted = manifest.acceptedCombinations.find((item) => item.id === entry.id);
  if (!accepted) {
    return {
      available: false,
      reason: `This stack is not included in the verified ${manifest.version} release. Choose a published stack or wait for a compatible release.`,
      selection,
    };
  }

  const command = [
    "bunx",
    "--bun",
    "--package",
    archiveUrl.toString(),
    "create-flare-stack",
    projectName,
    ...commandParts,
  ].join(" ");
  return { available: true, command, selection, backend: accepted.backend };
}
