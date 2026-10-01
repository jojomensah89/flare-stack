import { resolve } from "node:path";
import { FLARE_VERSION, type ProjectOptions, type ProjectPlan, UserInputError } from "./model";
import { makeReleaseMetadata } from "./release";

export function createProjectPlan(options: ProjectOptions): ProjectPlan {
  if (options.preset !== "app" && options.preset !== "fullstack") {
    throw new UserInputError("Supported presets: app, fullstack.");
  }
  if (
    String(options.database) !== "none" &&
    String(options.database) !== "d1" &&
    String(options.database) !== "neon"
  ) {
    throw new UserInputError("Supported database choices: none, d1, neon.");
  }
  if (options.auth === "better-auth" && options.database === "none") {
    throw new UserInputError(
      "Better Auth requires a database. Re-run with `--db d1 --auth` or `--db neon --auth`.",
    );
  }

  const templateLayers = ["base", "app"];
  if (options.preset === "fullstack") {
    templateLayers.push("fullstack/common");
  }
  if (options.database === "d1") {
    templateLayers.push("db/d1");
    if (options.preset === "fullstack") {
      templateLayers.push("fullstack/db-d1");
    }
  } else if (options.database === "neon") {
    templateLayers.push("db/neon");
    if (options.preset === "fullstack") {
      templateLayers.push("fullstack/db-neon");
    }
  }
  if (options.auth === "better-auth") {
    templateLayers.push("auth/better-auth");
    if (options.preset === "fullstack") {
      templateLayers.push("fullstack/auth-better-auth");
    }
    if (options.database === "neon") {
      templateLayers.push("auth/better-auth-neon");
      if (options.preset === "fullstack") {
        templateLayers.push("fullstack/auth-better-auth-neon");
      }
    }
  }

  return {
    options,
    templateLayers,
    releaseMetadata: makeReleaseMetadata(),
    validationSteps: [
      "validate destination and option compatibility",
      "copy base and selected app/database/auth overlays",
      "install dependencies with Bun",
      "initialize Git and run bun setup",
      "run bun check",
      "run bun run build",
    ],
  };
}

export function resolveTemplateRoot(packageDirectory: string): string {
  return resolve(packageDirectory, "templates", FLARE_VERSION);
}
