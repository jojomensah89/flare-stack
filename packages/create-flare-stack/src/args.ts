import { existsSync, lstatSync, readFileSync } from "node:fs";
import { basename, dirname, parse, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import {
  FLARE_VERSION,
  type Auth,
  type Database,
  type ParsedArguments,
  type Preset,
  type ProjectOptions,
  UserInputError,
} from "./model";
import { validateCatalogProjectName } from "./catalog";
import { resolveRequestedSkills } from "./skills";

function takeValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new UserInputError(`${flag} requires a value.`);
  }
  return value;
}

export function parseArguments(args: string[]): ParsedArguments {
  const parsed: ParsedArguments = { help: false };
  const positional: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === undefined) throw new UserInputError("Unexpected missing command-line argument.");
    if (value === "--help" || value === "-h") {
      parsed.help = true;
      continue;
    }

    if (
      value === "--preset" ||
      value === "--frontend" ||
      value === "--db" ||
      value === "--database" ||
      value === "--flare-package"
    ) {
      const optionValue = takeValue(args, index, value);
      index += 1;
      if (value === "--preset") parsed.preset = optionValue;
      if (value === "--frontend") parsed.frontend = optionValue;
      if (value === "--db" || value === "--database") parsed.database = optionValue;
      if (value === "--flare-package") parsed.flarePackagePath = optionValue;
      continue;
    }

    if (
      value.startsWith("--preset=") ||
      value.startsWith("--frontend=") ||
      value.startsWith("--db=") ||
      value.startsWith("--database=") ||
      value.startsWith("--flare-package=")
    ) {
      const separator = value.indexOf("=");
      const flag = value.slice(0, separator);
      const optionValue = value.slice(separator + 1);
      if (!optionValue) throw new UserInputError(`${flag} requires a value.`);
      if (flag === "--preset") parsed.preset = optionValue;
      if (flag === "--frontend") parsed.frontend = optionValue;
      if (flag === "--db" || flag === "--database") parsed.database = optionValue;
      if (flag === "--flare-package") parsed.flarePackagePath = optionValue;
      continue;
    }

    if (value === "--auth") {
      parsed.auth = "better-auth";
      continue;
    }
    if (value.startsWith("--auth=")) {
      parsed.auth = value.slice("--auth=".length);
      if (!parsed.auth)
        throw new UserInputError("--auth requires `none` or `better-auth` when using `=`.");
      continue;
    }

    if (value === "--skills") {
      const optionValue = takeValue(args, index, value);
      index += 1;
      parsed.skills = optionValue;
      continue;
    }
    if (value.startsWith("--skills=")) {
      const separator = value.indexOf("=");
      const optionValue = value.slice(separator + 1);
      if (!optionValue) throw new UserInputError("--skills requires a value.");
      parsed.skills = optionValue;
      continue;
    }

    if (value.startsWith("-")) {
      throw new UserInputError(`Unknown option: ${value}`);
    }
    positional.push(value);
  }

  if (positional.length > 1) {
    throw new UserInputError(`Expected one destination, received ${positional.length}.`);
  }
  parsed.destinationInput = positional[0];
  return parsed;
}

export function validateProjectName(name: string): string {
  const validation = validateCatalogProjectName(name);
  if (!validation.valid) throw new UserInputError(validation.message ?? "Project name is invalid.");
  return name;
}

export function validateRequestedChoices(parsed: ParsedArguments): void {
  if (
    parsed.preset &&
    parsed.preset.toLowerCase() !== "app" &&
    parsed.preset.toLowerCase() !== "fullstack" &&
    parsed.preset.toLowerCase() !== "worker" &&
    parsed.preset.toLowerCase() !== "extension"
  ) {
    throw new UserInputError(
      `Preset \`${parsed.preset}\` is not available in this release. Supported presets: app, fullstack, worker, extension.`,
    );
  }
  if (parsed.database) {
    const database = parsed.database.toLowerCase();
    if (database !== "none" && database !== "d1" && database !== "neon") {
      throw new UserInputError(
        `Database \`${parsed.database}\` is not supported. Choose none, d1, or neon.`,
      );
    }
  }
  if (parsed.frontend) {
    const frontend = parsed.frontend.toLowerCase();
    if (frontend !== "start" && frontend !== "router") {
      throw new UserInputError(
        `Frontend \`${parsed.frontend}\` is not supported. Choose start or router.`,
      );
    }
  }
  if (
    parsed.auth &&
    parsed.auth.toLowerCase() !== "none" &&
    parsed.auth.toLowerCase() !== "better-auth"
  ) {
    throw new UserInputError(
      `Auth option \`${parsed.auth}\` is not supported. Choose none or better-auth.`,
    );
  }
  if (parsed.preset?.toLowerCase() === "worker" && parsed.auth?.toLowerCase() === "better-auth") {
    throw new UserInputError(
      "Worker preset does not support Better Auth session cookies; choose fullstack or app for web authentication.",
    );
  }
  if (
    parsed.preset?.toLowerCase() === "extension" &&
    parsed.auth?.toLowerCase() === "better-auth"
  ) {
    throw new UserInputError(
      "Extension preset is a client-side browser extension and does not support Better Auth. Companion backends should use worker or fullstack.",
    );
  }
  if (
    parsed.preset?.toLowerCase() === "extension" &&
    parsed.database &&
    parsed.database.toLowerCase() !== "none"
  ) {
    throw new UserInputError(
      "Extension preset is a client-side browser extension and has no database. Re-run with `--db none`.",
    );
  }
  if (parsed.database?.toLowerCase() === "none" && parsed.auth?.toLowerCase() === "better-auth") {
    throw new UserInputError(
      "Better Auth requires a database. Re-run with `--db d1 --auth` or `--db neon --auth`.",
    );
  }
}

function readTarString(buffer: Buffer, start: number, length: number): string {
  return buffer
    .subarray(start, start + length)
    .toString("utf8")
    .replace(/\0.*$/s, "")
    .trim();
}

function readLocalFlarePackage(path: string): { name?: string; version?: string } {
  const info = lstatSync(path);
  if (info.isDirectory()) {
    try {
      return JSON.parse(readFileSync(resolve(path, "package.json"), "utf8")) as {
        name?: string;
        version?: string;
      };
    } catch (error) {
      throw new UserInputError(
        `--flare-package directory must contain a valid package.json: ${String(error)}`,
      );
    }
  }

  if (
    !info.isFile() ||
    (!path.toLowerCase().endsWith(".tgz") && !path.toLowerCase().endsWith(".tar.gz"))
  ) {
    throw new UserInputError(
      "--flare-package must be a Flare package directory or an npm .tgz/.tar.gz package tarball.",
    );
  }
  if (info.size > 25 * 1024 * 1024) {
    throw new UserInputError("--flare-package tarball is larger than the 25 MB validation limit.");
  }

  let archive: Buffer;
  try {
    archive = gunzipSync(readFileSync(path), { maxOutputLength: 64 * 1024 * 1024 });
  } catch (error) {
    throw new UserInputError(
      `--flare-package is not a readable gzip npm tarball: ${String(error)}`,
    );
  }
  for (let offset = 0; offset + 512 <= archive.length;) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = readTarString(header, 0, 100);
    const prefix = readTarString(header, 345, 155);
    const entryPath = (prefix ? `${prefix}/${name}` : name).replace(/^\.\//, "");
    const sizeField = readTarString(header, 124, 12);
    const size = Number.parseInt(sizeField || "0", 8);
    if (!Number.isFinite(size) || size < 0 || offset + 512 + size > archive.length) break;
    if (entryPath === "package/package.json") {
      try {
        return JSON.parse(archive.subarray(offset + 512, offset + 512 + size).toString("utf8")) as {
          name?: string;
          version?: string;
        };
      } catch (error) {
        throw new UserInputError(
          `--flare-package tarball contains an invalid package.json: ${String(error)}`,
        );
      }
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  throw new UserInputError("--flare-package tarball does not contain package/package.json.");
}

export function makeProjectOptions(parsed: ParsedArguments, cwd = process.cwd()): ProjectOptions {
  if (!parsed.destinationInput) {
    throw new UserInputError("Provide a destination, for example `create-flare-stack my-app`.");
  }

  const destination = resolve(cwd, parsed.destinationInput);
  const projectName = validateProjectName(basename(destination));
  if (destination === parse(destination).root || destination === resolve(cwd)) {
    throw new UserInputError(
      "Choose a new project directory; Flare will not scaffold over the current directory or a filesystem root.",
    );
  }

  const preset = (parsed.preset ?? "app").toLowerCase() as Preset;
  if (preset !== "app" && preset !== "fullstack" && preset !== "worker" && preset !== "extension") {
    throw new UserInputError(
      `Preset \`${parsed.preset}\` is not available in this release. Supported presets: app, fullstack, worker, extension.`,
    );
  }
  const scopedNameValidation = validateCatalogProjectName(projectName, preset);
  if (!scopedNameValidation.valid) {
    throw new UserInputError(scopedNameValidation.message ?? "Project name is invalid.");
  }
  if (preset === "fullstack" && !parsed.flarePackagePath) {
    throw new UserInputError(
      "Fullstack generation from this unreleased source requires --flare-package. From the Flare Stack checkout use --flare-package ./packages/flare, or provide the matching Flare CLI archive.",
    );
  }

  const db = (parsed.database ?? "none").toLowerCase() as Database;
  if (db !== "none" && db !== "d1" && db !== "neon") {
    throw new UserInputError(
      `Database \`${parsed.database}\` is not supported. Choose none, d1, or neon.`,
    );
  }

  const auth = (parsed.auth ?? "none").toLowerCase() as Auth;
  if (auth !== "none" && auth !== "better-auth") {
    throw new UserInputError(
      `Auth option \`${parsed.auth}\` is not supported. Choose none or better-auth.`,
    );
  }
  const frontend = parsed.frontend?.toLowerCase() as "start" | "router" | undefined;
  if (frontend && preset !== "fullstack") {
    throw new UserInputError(
      "The --frontend option is available only for the fullstack preset. The app preset uses TanStack Start; Router requires --preset fullstack.",
    );
  }
  if (preset === "worker" && auth === "better-auth") {
    throw new UserInputError(
      "Worker preset does not support Better Auth session cookies; choose fullstack or app for web authentication.",
    );
  }
  if (preset === "extension" && auth === "better-auth") {
    throw new UserInputError(
      "Extension preset is a client-side browser extension and does not support Better Auth. Companion backends should use worker or fullstack.",
    );
  }
  if (preset === "extension" && db !== "none") {
    throw new UserInputError(
      "Extension preset is a client-side browser extension and has no database. Re-run with `--db none`.",
    );
  }
  if (auth === "better-auth" && db === "none") {
    throw new UserInputError(
      "Better Auth requires a database. Re-run with `--db d1 --auth` or `--db neon --auth`.",
    );
  }

  if (parsed.flarePackagePath) {
    const isUrl =
      parsed.flarePackagePath.startsWith("http://") ||
      parsed.flarePackagePath.startsWith("https://");
    if (isUrl) {
      if (!parsed.flarePackagePath.endsWith(".tgz")) {
        throw new UserInputError(
          "--flare-package URL must point to a .tgz archive of the Flare package.",
        );
      }
    } else {
      const localFlarePackagePath = resolve(cwd, parsed.flarePackagePath);
      if (!existsSync(localFlarePackagePath)) {
        throw new UserInputError(
          `Local Flare package path does not exist: ${localFlarePackagePath}`,
        );
      }
      const packageInfo = readLocalFlarePackage(localFlarePackagePath);
      if (packageInfo.name !== "flare" || packageInfo.version !== FLARE_VERSION) {
        throw new UserInputError(
          `--flare-package must be flare@${FLARE_VERSION}; received ${packageInfo.name ?? "unknown"}@${packageInfo.version ?? "unknown"}.`,
        );
      }
    }
  }

  const parent = dirname(destination);
  if (!existsSync(parent) || !lstatSync(parent).isDirectory()) {
    throw new UserInputError(`Destination parent directory does not exist: ${parent}`);
  }
  if (existsSync(destination)) {
    throw new UserInputError(`Destination already exists: ${destination}. Choose a new directory.`);
  }

  const flarePackageTarget = parsed.flarePackagePath
    ? parsed.flarePackagePath.startsWith("http://") ||
      parsed.flarePackagePath.startsWith("https://")
      ? parsed.flarePackagePath
      : resolve(cwd, parsed.flarePackagePath)
    : undefined;

  const skills = resolveRequestedSkills(parsed.skills);

  return {
    destination,
    projectName,
    preset,
    ...(preset === "fullstack" ? { frontend: frontend ?? "start" } : {}),
    database: db,
    auth,
    skills,
    ...(flarePackageTarget ? { flarePackagePath: flarePackageTarget } : {}),
  };
}
