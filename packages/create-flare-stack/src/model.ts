import type { ReleaseMetadata } from "./release";

export const FLARE_VERSION = "0.14.1";

export type Preset = "app" | "fullstack" | "worker" | "extension";
export type Database = "none" | "d1" | "neon";
export type Auth = "none" | "better-auth";

export interface ProjectOptions {
  destination: string;
  projectName: string;
  preset: Preset;
  database: Database;
  auth: Auth;
  flarePackagePath?: string;
}

export interface ParsedArguments {
  destinationInput?: string;
  preset?: string;
  database?: string;
  auth?: string;
  flarePackagePath?: string;
  help: boolean;
}

export interface ProjectPlan {
  options: ProjectOptions;
  templateLayers: string[];
  validationSteps: string[];
  releaseMetadata?: ReleaseMetadata;
}

export class UserInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserInputError";
  }
}

export class GenerationError extends Error {
  readonly step: string;
  readonly remediation: string;

  constructor(step: string, message: string, remediation: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "GenerationError";
    this.step = step;
    this.remediation = remediation;
  }
}
