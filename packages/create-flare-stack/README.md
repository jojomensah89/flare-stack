# create-flare-stack

The Flare Stack scaffolder distributed via GitHub Releases.

```powershell
bunx --bun --package https://github.com/jojomensah89/flare-stack/releases/download/v0.14.1/create-flare-stack-0.14.1.tgz create-flare-stack my-app --db d1 --auth
```

This generator release supports the `app` and `fullstack` presets with no database or D1, and optional Better Auth when D1 is selected. Extension, worker, and Neon templates fail with an explicit unsupported-choice message until their fixtures are ready.

The generator composes versioned templates shipped inside this package, pins the matching `flare` lifecycle CLI release archive (`https://github.com/jojomensah89/flare-stack/releases/download/v0.14.1/flare-0.14.1.tgz`), initializes Git, installs with Bun, runs `bun setup`, formats rendered source, runs `bun check` and `bun run build`, and reports any failing command with remediation. It moves the static scaffold to its final path before installation so Bun workspace links point at the stable destination. If setup or validation fails after that point, the incomplete project stays at that destination for inspection and is reported as unvalidated.

In an interactive terminal, the CLI asks for preset, database, and optional Better Auth choices. Without a terminal or explicit flags, it deterministically creates the app preset with no database and no authentication.

For development testing or custom package archives before publishing, pass an absolute path or HTTP(S) URL via `--flare-package`:

```powershell
bunx --bun --package ./create-flare-stack-0.14.1.tgz create-flare-stack my-app --flare-package C:\path\to\flare-0.14.1.tgz
```

The override is explicit; the generator never resolves an unrelated local `flare` package implicitly.
