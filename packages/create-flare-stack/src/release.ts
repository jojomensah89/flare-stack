import { FLARE_VERSION } from "./model";

export const DEFAULT_GITHUB_OWNER = "jojomensah89";
export const DEFAULT_GITHUB_REPO = "flare-stack";
export const DEFAULT_RELEASE_TAG = `v${FLARE_VERSION}`;
export const DEFAULT_FLARE_ARCHIVE_NAME = `flare-${FLARE_VERSION}.tgz`;
export const DEFAULT_GENERATOR_ARCHIVE_NAME = `create-flare-stack-${FLARE_VERSION}.tgz`;

export const DEFAULT_FLARE_RELEASE_URL = `https://github.com/${DEFAULT_GITHUB_OWNER}/${DEFAULT_GITHUB_REPO}/releases/download/${DEFAULT_RELEASE_TAG}/${DEFAULT_FLARE_ARCHIVE_NAME}`;

export const DEFAULT_GENERATOR_RELEASE_URL = `https://github.com/${DEFAULT_GITHUB_OWNER}/${DEFAULT_GITHUB_REPO}/releases/download/${DEFAULT_RELEASE_TAG}/${DEFAULT_GENERATOR_ARCHIVE_NAME}`;

export interface ReleaseMetadata {
  version: string;
  tag: string;
  owner: string;
  repository: string;
  flareArchiveName: string;
  generatorArchiveName: string;
  flareReleaseUrl: string;
  generatorReleaseUrl: string;
}

export function makeReleaseMetadata(options?: {
  owner?: string;
  repository?: string;
  tag?: string;
  flareReleaseUrl?: string;
  generatorReleaseUrl?: string;
}): ReleaseMetadata {
  const owner = options?.owner ?? process.env.FLARE_GITHUB_OWNER ?? DEFAULT_GITHUB_OWNER;
  const repository = options?.repository ?? process.env.FLARE_GITHUB_REPO ?? DEFAULT_GITHUB_REPO;
  const tag = options?.tag ?? process.env.FLARE_RELEASE_TAG ?? `v${FLARE_VERSION}`;
  const flareArchiveName = DEFAULT_FLARE_ARCHIVE_NAME;
  const generatorArchiveName = DEFAULT_GENERATOR_ARCHIVE_NAME;

  const flareReleaseUrl =
    options?.flareReleaseUrl ??
    process.env.FLARE_ARCHIVE_URL ??
    (owner === DEFAULT_GITHUB_OWNER &&
    repository === DEFAULT_GITHUB_REPO &&
    tag === DEFAULT_RELEASE_TAG
      ? DEFAULT_FLARE_RELEASE_URL
      : `https://github.com/${owner}/${repository}/releases/download/${tag}/${flareArchiveName}`);

  const generatorReleaseUrl =
    options?.generatorReleaseUrl ??
    process.env.CREATE_FLARE_STACK_ARCHIVE_URL ??
    (owner === DEFAULT_GITHUB_OWNER &&
    repository === DEFAULT_GITHUB_REPO &&
    tag === DEFAULT_RELEASE_TAG
      ? DEFAULT_GENERATOR_RELEASE_URL
      : `https://github.com/${owner}/${repository}/releases/download/${tag}/${generatorArchiveName}`);

  return {
    version: FLARE_VERSION,
    tag,
    owner,
    repository,
    flareArchiveName,
    generatorArchiveName,
    flareReleaseUrl,
    generatorReleaseUrl,
  };
}
