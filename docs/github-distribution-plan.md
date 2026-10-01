# GitHub distribution research

Researched on 2026-10-01 against the current checkout and official documentation. This is a proposed distribution design, not a claim that a GitHub release or complete remote installer exists.

## Decision

The user wants a quick GitHub-hosted setup command and explicitly rejects publishing `flare` or `create-flare-stack` to npm. This direction supersedes the registry-based distribution described in the frozen v0.14.1 specification. Keep the generator and lifecycle package boundaries; change their delivery channel.

Use two matching package archives attached to a tagged GitHub Release:

- `create-flare-stack-0.14.1.tgz`: the Bun generator and curated templates.
- `flare-0.14.1.tgz`: the lifecycle CLI used inside generated applications.

Start with local archive preparation and attaching the files to a GitHub Release. An automated release pipeline is optional; no package registry account or separate installer service is needed.

Packing an archive with `bun pm pack` is a local operation and does not publish it to a package registry. GitHub supports downloadable assets attached to releases. Bun supports publicly accessible tarball URL dependencies. [GitHub release documentation](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases), [Bun tarball dependencies](https://bun.com/guides/install/add-tarball).

Proposed setup command, after the release artifacts and generator changes exist:

```powershell
bunx --bun --package https://github.com/OWNER/flare-stack/releases/download/v0.14.1/create-flare-stack-0.14.1.tgz create-flare-stack my-app --db d1 --auth
```

`OWNER` is a placeholder. This checkout has no configured Git remote, so there is no verified hosted URL to substitute. The assets must be publicly downloadable for this command without extra authentication. Bun must already be installed. The existing CLI has a Bun shebang and uses TypeScript/Bun APIs. Bun documents `--package` for selecting the package separately from its executable and respects runtime shebangs. [Bun executable documentation](https://bun.sh/docs/pm/bunx).

The generated root manifest should record:

```json
{
  "devDependencies": {
    "flare": "https://github.com/OWNER/flare-stack/releases/download/v0.14.1/flare-0.14.1.tgz"
  }
}
```

Pin the tag and matching package version. The generator must obtain the release URL from validated release metadata, not guess an owner or depend on a mutable `latest` URL. Keep the existing local `--flare-package` override for development. Normal third-party dependencies still come from their existing registries; Flare itself does not need registry publication.

A version tag alone does not prevent replacing its assets. Use GitHub immutable releases to preserve the tested archives: attach both files to a draft before publishing it. [GitHub immutable release documentation](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases).

## Alternatives

| Route                                                     | Assessment                                                                                                                                                                                                                                               |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bunx --package <release archive> create-flare-stack ...` | Recommended: runs the existing generator and downloads only its packaged files.                                                                                                                                                                          |
| `bun create OWNER/template-repo my-app`                   | Bun officially supports GitHub templates and installs dependencies. Useful for one fixed application template, but pointing it at this source repository would copy the toolkit/reference monorepo rather than compose the selected application profile. |
| `bunx github:OWNER/flare-stack`                           | Requires an executable at the repository package boundary. The current root has no `bin` and carries reference-app dependencies; its nested generator is a separate package.                                                                             |
| `npx --package=<release archive> create-flare-stack ...`  | npm documents tarball package specs and executable selection. Possible compatibility route, but still requires Bun to run this CLI and is not locally verified here. Adding a separate Node implementation is unnecessary for the Bun-first project.     |

[Bun GitHub templates](https://bun.sh/docs/runtime/templating/create), [npm package specs](https://docs.npmjs.com/cli/v11/using-npm/package-spec/), [npm executable selection](https://docs.npmjs.com/cli/v11/commands/npm-exec/).

## Evidence and limits

New isolated probes on Windows with Bun 1.4.2 used the existing packed archives and a temporary loopback HTTP server:

- Explicit `bun x --bun --package <HTTP generator archive> create-flare-stack --help` downloaded, extracted, and ran successfully.
- Bare `bun x --bun <HTTP generator archive> --help` failed with an unrecognized dependency format. Document the explicit package form.
- A disposable project installed `flare` from an HTTP archive dependency, read back `flare@0.14.1`, and ran its installed CLI help successfully.

Temporary projects and servers were cleaned up. These probes establish archive transport and executable compatibility, not GitHub redirect/authentication behavior, full downloaded generation, live Cloudflare deployment, or macOS/Linux support. Previously recorded three-profile generation and React Doctor evidence are separate from these new probes.

## Implementation packets and done evidence

1. Add release metadata and change the generator's default lifecycle dependency from `"0.14.1"` to the matching GitHub asset URL. Update rendered-manifest validation, fixtures, CLI help/usage errors, workflow remediation, and the generator package README together; these still contain registry-based commands today. Done: generated manifests and lockfiles resolve the intended archive, packed CLI help displays the GitHub entrypoint, and no registry-only Flare dependency or absolute development path remains.
2. Add a local release-preparation command that packs both archives, validates matching versions and contents, and emits the setup command. Attach assets to GitHub only as an explicitly authorized release action. Done: reproducible archives and a real owner/repository/tag are available.
3. Exercise the downloaded generator in an empty directory for all three supported profiles. Done: install, setup, format, quality gate, build, and lifecycle execution pass; cloning the resulting application elsewhere and reinstalling works without the original development checkout.
4. Run the same matrix on macOS and Linux. Done: independent execution evidence exists for both, alongside Windows.
5. Complete account namespace discovery and clean-account Cloudflare acceptance. Done: actual resource IDs, preview/production secrets, remote migrations, repeated preview deployment, response policy, health checks, and browser auth sessions are verified.

For personal local use, packets 1–3 are the immediate distribution work. Cloudflare acceptance is required before treating the supported deployment path as proven; additional presets are not prerequisites for using the app generator locally.

## Remaining specification roadmap

The user's remaining-work list is broadly correct. It omits recipes, the component registry/capability composition surface, upgrades, and resource/deployment history. Fullstack orchestration, Neon remote lifecycle, worker/extension scaffolds, safe D1 reset recovery, and seed definitions also remain deferred.

Keep the app-first path and existing quality gates. Remove npm ownership/publication from the release checklist. Defer a custom installer service, separate Node CLI, runtime plugin framework, and additional presets until the GitHub download and first Cloudflare deployment have been demonstrated.
