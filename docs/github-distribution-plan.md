# GitHub distribution status

Reviewed on 2026-10-01 against the current source, recorded release evidence, and the public release page. This document distinguishes package/release code, local fixture evidence, and remote acceptance. It does not claim tests were rerun in this documentation update.

## Distribution decision and current release

Flare packages are distributed as GitHub Release tarballs; Flare itself is not published to npm. The public [v0.14.1 release](https://github.com/jojomensah89/flare-stack/releases/tag/v0.14.1) exists and carries the `create-flare-stack-0.14.1.tgz` generator archive and the `flare-0.14.1.tgz` lifecycle archive, as recorded by the implementation status. The repository remote and package metadata identify `jojomensah89/flare-stack`; `OWNER` is no longer a placeholder for this release.

The current default generated-project command is:

```powershell
bunx --bun --package https://github.com/jojomensah89/flare-stack/releases/download/v0.14.1/create-flare-stack-0.14.1.tgz create-flare-stack my-app --db d1 --auth
```

Generated manifests pin the matching lifecycle archive URL:

```text
https://github.com/jojomensah89/flare-stack/releases/download/v0.14.1/flare-0.14.1.tgz
```

Release metadata lives in `packages/create-flare-stack/src/release.ts`. `bun run release:prepare` packs both packages, checks version parity and required archive contents, records hashes, and prints the target release, upload command, and setup command. It prepares local files; it does not publish a GitHub release. The v0.14.1 release has already been published. Future releases still require an explicit release action after their artifacts and acceptance evidence are ready.

## What the evidence proves

| Evidence                                                 | Scope                                                                                                                                                                                                             | Limit                                                                                                                                        |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Public GitHub v0.14.1 release                            | Release page is available at the link above; the implementation status records both named package archives and a live HTTPS `bunx --package` smoke.                                                               | The recorded smoke proves the exercised URL/package invocation only. It is not a full clean-account deployment or cross-platform acceptance. |
| `scripts/verify-release-distribution.ts`                 | The local distribution fixture packs both archives, serves them over a temporary loopback HTTP server, runs the generator through `bunx --package`, and composes generated profiles using that local archive URL. | Loopback HTTP is not GitHub. This fixture does not prove GitHub redirect/download behavior for every profile.                                |
| `packages/create-flare-stack/scripts/verify-fixtures.ts` | Separate local packed-archive fixtures exercise generated-project installation and validation.                                                                                                                    | Local archive paths do not prove GitHub-hosted generation or remote provider behavior.                                                       |
| `scripts/prepare-release.ts`                             | Produces versioned archives and an upload command; source checks required package entries and versions and calculates SHA-256 hashes.                                                                             | Source code alone does not prove a particular invocation succeeded or that the resulting artifacts match the published release.              |
| GitHub Actions quality matrix                            | The current worktree defines Ubuntu, macOS, and Windows jobs for checks/builds and local fixture scripts.                                                                                                         | No successful macOS or Linux run is recorded in this checkout. A workflow definition must not be reported as execution evidence.             |

## Remaining distribution and deployment evidence

1. Record successful macOS and Linux runs of the quality, build, generator, and lifecycle matrix. Windows evidence does not cover those platforms.
2. Exercise the remaining generated profiles against remote Cloudflare. The implementation status records live D1 production and isolated Preview proof for the reference app; this does not prove every profile. In particular, a deployed Cloudflare Worker using a real Neon preview/production database, real migrations, and real requests remains an open release gate.
3. Hostname discovery code now queries the Cloudflare account Workers-subdomain endpoint when one or both auth host overrides are omitted. Its fixture source uses a mocked API response. Do not claim discovery is verified until the fixture has a recorded successful run and an account-level API smoke confirms the required token/account settings and resolved hosts.
4. If a future release changes package versions or archive contents, prepare the new archives, verify the generated manifest URLs and the public tag/assets, then record the exact evidence. Do not reuse v0.14.1 verification as proof for another release.

The GitHub release channel is in use; no separate installer service or package-registry publication is needed. `bun run test:distribution` is useful local evidence but must remain clearly labeled as a loopback fixture.

## Phase 7 gate

The normative v0.14.1 specification says not to start Phase 7 until the preset matrix is stable. Keep recipes, the registry/capability composition surface, upgrades, deployment/resource history, and cleanup behind that gate. Local GitHub archive distribution does not satisfy remote Cloudflare or Neon release acceptance and does not clear the Phase 7 gate.
