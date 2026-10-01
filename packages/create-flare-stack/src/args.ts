import { existsSync, lstatSync, readFileSync } from "node:fs";
import { basename, dirname, isAbsolute, parse, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import {
  FLARE_VERSION,
  type ParsedArguments,
  type Preset,
  type ProjectOptions,
  UserInputError,
} from "./model";

const RESERVED_WINDOWS_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

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
      value === "--db" ||
      value === "--database" ||
      value === "--flare-package"
    ) {
      const optionValue = takeValue(args, index, value);
      index += 1;
      if (value === "--preset") parsed.preset = optionValue;
      if (value === "--db" || value === "--database") parsed.database = optionValue;
      if (value === "--flare-package") parsed.flarePackagePath = optionValue;
      continue;
    }

    if (
      value.startsWith("--preset=") ||
      value.startsWith("--db=") ||
      value.startsWith("--database=") ||
      value.startsWith("--flare-package=")
    ) {
      const separator = value.indexOf("=");
      const flag = value.slice(0, separator);
      const optionValue = value.slice(separator + 1);
      if (!optionValue) throw new UserInputError(`${flag} requires a value.`);
      if (flag === "--preset") parsed.preset = optionValue;
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
  if (name.length < 1 || name.length > 58) {
    throw new UserInputError(
      "Project name must be between 1 and 58 characters so the generated Worker name stays within Cloudflare's 63-character limit.",
    );
  }
  if (name !== name.toLowerCase()) {
    throw new UserInputError(
      "Use a lowercase project name so it works consistently across package managers.",
    );
  }
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(name)) {
    throw new UserInputError(
      "Project name may contain lowercase letters, numbers, and hyphens; it must start and end with a letter or number.",
    );
  }
  if (RESERVED_WINDOWS_NAMES.test(name)) {
    throw new UserInputError(`Project name \`${name}\` is reserved on Windows.`);
  }
  return name;
}

export function validateRequestedChoices(parsed: ParsedArguments): void {
  if (
    parsed.preset &&
    parsed.preset.toLowerCase() !== "app" &&
    parsed.preset.toLowerCase() !== "fullstack"
  ) {
    throw new UserInputError(
      `Preset \`${parsed.preset}\` is not available in this release. Supported presets: app, fullstack.`,
    );
  }
  if (parsed.database) {
    const database = parsed.database.toLowerCase();
    if (database === "neon") {
      throw new UserInputError(
        "Neon is planned but not generated in this release. Supported database choices: none, d1.",
      );
    }
    if (database !== "none" && database !== "d1") {
      throw new UserInputError(
        `Database \`${parsed.database}\` is not supported. Choose none or d1.`,
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
  if (parsed.database?.toLowerCase() === "none" && parsed.auth?.toLowerCase() === "better-auth") {
    throw new UserInputError("Better Auth requires a database. Re-run with `--db d1 --auth`.");
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
  if (preset !== "app" && preset !== "fullstack") {
    throw new UserInputError(
      `Preset \`${parsed.preset}\` is not available in this release. Supported presets: app, fullstack.`,
    );
  }

  const db = (parsed.database ?? "none").toLowerCase();
  if (db === "neon") {
    throw new UserInputError(
      "Neon is planned but not generated in this release. Supported database choices: none, d1.",
    );
  }
  if (db !== "none" && db !== "d1") {
    throw new UserInputError(
      `Database \`${parsed.database}\` is not supported. Choose none or d1.`,
    );
  }

  const auth = (parsed.auth ?? "none").toLowerCase();
  if (auth !== "none" && auth !== "better-auth") {
    throw new UserInputError(
      `Auth option \`${parsed.auth}\` is not supported. Choose none or better-auth.`,
    );
  }
  if (auth === "better-auth" && db === "none") {
    throw new UserInputError("Better Auth requires a database. Re-run with `--db d1 --auth`.");
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
      if (!isAbsolute(parsed.flarePackagePath)) {
        throw new UserInputError(
          "--flare-package must be an absolute path or an http(s) URL to a Flare package archive.",
        );
      }
      if (!existsSync(parsed.flarePackagePath)) {
        throw new UserInputError(
          `Local Flare package path does not exist: ${parsed.flarePackagePath}`,
        );
      }
      const packageInfo = readLocalFlarePackage(parsed.flarePackagePath);
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
      : resolve(parsed.flarePackagePath)
    : undefined;

  return {
    destination,
    projectName,
    preset,
    database: db,
    auth,
    ...(flarePackageTarget ? { flarePackagePath: flarePackageTarget } : {}),
  };
}
