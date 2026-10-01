import { resolve } from "node:path";
import { FLARE_VERSION, type ProjectOptions, type ProjectPlan, UserInputError } from "./model";
import { makeReleaseMetadata } from "./release";

export function createProjectPlan(options: ProjectOptions): ProjectPlan {
  if (options.preset !== "app") {
    throw new UserInputError("This generator release supports only the app preset.");
  }
  if (String(options.database) !== "none" && String(options.database) !== "d1") {
    throw new UserInputError(
      "Neon is planned but not generated in this release. Supported database choices: none, d1.",
    );
  }
  if (options.auth === "better-auth" && options.database === "none") {
    throw new UserInputError("Better Auth requires a database. Re-run with `--db d1 --auth`.");
  }

  const templateLayers = ["base", "app"];
  if (options.database === "d1") templateLayers.push("db/d1");
  if (options.auth === "better-auth") templateLayers.push("auth/better-auth");

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
