import { strict as assert } from "node:assert";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import {
  commandDb,
  getCanonicalLocalD1StatePath,
  resetLocalD1State,
  type LocalD1PathKind,
  type LocalD1StateFileSystem,
} from "../src/commands/db";
import { loadProject } from "../src/project";
import type { CliDependencies } from "../src/commands/common";
import type { CommandRunner, ManagedCommand, RunOptions, RunResult } from "../src/runner";

const databaseId = "00000000-0000-0000-0000-000000000031";

function success(stdout = ""): RunResult {
  return { status: 0, stdout, stderr: "" };
}

function fail(message: string): never {
  throw new Error(message);
}

function assertRejects(action: () => unknown, pattern: RegExp): void {
  assert.throws(action, pattern);
}

class FakeFileSystem implements LocalD1StateFileSystem {
  private readonly nodes = new Map<string, LocalD1PathKind>();
  private readonly realpaths = new Map<string, string>();

  constructor(root: string) {
    this.add(root, "directory");
  }

  add(path: string, kind: LocalD1PathKind): void {
    this.nodes.set(this.key(path), kind);
  }

  setRealpath(path: string, destination: string): void {
    this.realpaths.set(this.key(path), resolve(destination));
  }

  kind(path: string): LocalD1PathKind {
    return this.nodes.get(this.key(path)) ?? "missing";
  }

  realpath(path: string): string {
    const key = this.key(path);
    if (this.kind(path) === "missing") throw new Error(`ENOENT: ${path}`);
    return this.realpaths.get(key) ?? resolve(path);
  }

  mkdir(path: string): void {
    if (this.kind(path) !== "missing") throw new Error(`EEXIST: ${path}`);
    const parent = dirname(path);
    if (this.kind(parent) !== "directory") throw new Error(`ENOENT: ${parent}`);
    this.add(path, "directory");
  }

  rename(from: string, to: string): void {
    if (this.kind(from) === "missing") throw new Error(`ENOENT: ${from}`);
    if (this.kind(to) !== "missing") throw new Error(`EEXIST: ${to}`);
    if (this.key(dirname(from)) !== this.key(dirname(to))) throw new Error("EXDEV");
    const fromKey = this.key(from);
    const toKey = this.key(to);
    const children = [...this.nodes.entries()].filter(
      ([path]) => path === fromKey || path.startsWith(`${fromKey}${sep}`),
    );
    for (const [path] of children) this.nodes.delete(path);
    for (const [path, kind] of children) {
      const suffix = path.slice(fromKey.length);
      this.nodes.set(`${toKey}${suffix}`, kind);
    }
  }

  removeTree(path: string): void {
    const rootKey = this.key(path);
    if (this.kind(path) === "missing") throw new Error(`ENOENT: ${path}`);
    for (const candidate of this.nodes.keys()) {
      if (candidate === rootKey || candidate.startsWith(`${rootKey}${sep}`)) {
        this.nodes.delete(candidate);
      }
    }
  }

  paths(): string[] {
    return [...this.nodes.keys()];
  }

  private key(path: string): string {
    const normalized = resolve(path);
    return process.platform === "win32" ? normalized.toLowerCase() : normalized;
  }
}

function fakeProject(
  root: string,
): { root: string; config: { database: "d1" } } & Record<string, unknown> {
  return {
    root,
    config: { database: "d1" },
  };
}

async function verifyFilesystemResetSuccess(): Promise<void> {
  const root = resolve("/fixture/success");
  const wrangler = join(root, ".wrangler");
  const state = join(wrangler, "state");
  const fs = new FakeFileSystem(root);
  fs.add(wrangler, "directory");
  fs.add(state, "directory");
  fs.add(join(state, "old.sqlite"), "file");
  let replayed = false;
  const result = await resetLocalD1State(
    fakeProject(root) as never,
    async () => {
      replayed = true;
      assert.equal(fs.kind(state), "directory");
      assert.equal(fs.kind(join(state, "old.sqlite")), "missing");
      assert.equal(fs.kind(join(wrangler, "state.flare-reset-backup-test-id")), "directory");
    },
    fs,
    () => "test-id",
  );
  assert.equal(replayed, true);
  assert.equal(result.statePath, state);
  assert.equal(result.retainedBackup, undefined);
  assert.equal(fs.kind(state), "directory");
  assert.equal(fs.kind(join(state, "old.sqlite")), "missing");
  assert.equal(
    fs.paths().some((path) => path.includes("flare-reset-backup")),
    false,
  );
}

async function verifyFilesystemResetRecovery(): Promise<void> {
  const root = resolve("/fixture/recovery");
  const wrangler = join(root, ".wrangler");
  const state = join(wrangler, "state");
  const oldFile = join(state, "before-reset.sqlite");
  const fs = new FakeFileSystem(root);
  fs.add(wrangler, "directory");
  fs.add(state, "directory");
  fs.add(oldFile, "file");

  await assert.rejects(
    resetLocalD1State(
      fakeProject(root) as never,
      async () => {
        assert.equal(fs.kind(oldFile), "missing");
        fs.add(join(state, "partially-migrated.sqlite"), "file");
        throw new Error("fixture migration replay failure");
      },
      fs,
      (() => {
        let index = 0;
        return () => `recovery-${++index}`;
      })(),
    ),
    /replay failed: Error: fixture migration replay failure.*Previous local state was restored/,
  );
  assert.equal(fs.kind(state), "directory");
  assert.equal(fs.kind(oldFile), "file", "original local state must be restored");
  assert.equal(fs.kind(join(state, "partially-migrated.sqlite")), "missing");
  assert.equal(
    fs.paths().some((path) => path.includes("flare-reset-backup")),
    false,
  );
  assert.equal(
    fs.paths().some((path) => path.includes("flare-reset-failed")),
    false,
  );
}

function verifyPathGuards(): void {
  const root = resolve("/fixture/guards");
  const wrangler = join(root, ".wrangler");
  const state = join(wrangler, "state");

  const parentSymlink = new FakeFileSystem(root);
  parentSymlink.add(wrangler, "symlink");
  assertRejects(
    () => getCanonicalLocalD1StatePath(fakeProject(root) as never, parentSymlink),
    /\.wrangler.*project-owned directory.*symlink/,
  );

  const stateSymlink = new FakeFileSystem(root);
  stateSymlink.add(wrangler, "directory");
  stateSymlink.add(state, "symlink");
  assertRejects(
    () => getCanonicalLocalD1StatePath(fakeProject(root) as never, stateSymlink),
    /state.*project-owned directory.*symlink/,
  );

  const redirectedState = new FakeFileSystem(root);
  redirectedState.add(wrangler, "directory");
  redirectedState.add(state, "directory");
  redirectedState.setRealpath(state, resolve("/outside/production-state"));
  assertRejects(
    () => getCanonicalLocalD1StatePath(fakeProject(root) as never, redirectedState),
    /state resolves outside the project root/,
  );

  const nonDirectoryRoot = new FakeFileSystem(root);
  nonDirectoryRoot.add(root, "file");
  assertRejects(
    () => getCanonicalLocalD1StatePath(fakeProject(root) as never, nonDirectoryRoot),
    /project root.*not a real directory/,
  );

  const alias = resolve("/fixture/project-alias");
  const canonical = resolve("/fixture/owned-project");
  const aliasedRoot = new FakeFileSystem(alias);
  aliasedRoot.add(alias, "symlink");
  aliasedRoot.add(canonical, "directory");
  aliasedRoot.setRealpath(alias, canonical);
  aliasedRoot.add(join(canonical, ".wrangler"), "directory");
  assert.equal(
    getCanonicalLocalD1StatePath(fakeProject(alias) as never, aliasedRoot),
    join(canonical, ".wrangler", "state"),
    "a symlinked project entry should resolve to its physical project-owned state tree",
  );
}

async function verifyRecoveryWithoutPreviousState(): Promise<void> {
  const root = resolve("/fixture/no-previous-state");
  const wrangler = join(root, ".wrangler");
  const state = join(wrangler, "state");
  const fs = new FakeFileSystem(root);
  fs.add(wrangler, "directory");
  await assert.rejects(
    resetLocalD1State(
      fakeProject(root) as never,
      async () => {
        fs.add(join(state, "partial.sqlite"), "file");
        throw new Error("no-state replay failure");
      },
      fs,
      () => "unused",
    ),
    /No previous state existed; the failed reset state was removed/,
  );
  assert.equal(fs.kind(state), "missing");
  assert.equal(
    fs.paths().some((path) => path.includes("flare-reset")),
    false,
  );
}

interface TempProject {
  root: string;
  cleanup(): void;
}

function createTempProject(): TempProject {
  const root = mkdtempSync(join(tmpdir(), "flare-db-ops-"));
  const web = join(root, "apps", "web");
  const db = join(root, "packages", "db");
  mkdirSync(web, { recursive: true });
  mkdirSync(db, { recursive: true });
  writeFileSync(
    join(root, "flare.config.ts"),
    `export default ${JSON.stringify({
      schemaVersion: 1,
      flareVersion: "0.14.1",
      productionBranch: "main",
      preset: "app",
      database: "d1",
      auth: "none",
      observability: "none",
      uiLint: "none",
      capabilities: [],
      deployment: { provider: "cloudflare", productionBranch: "main" },
    })};\n`,
    "utf8",
  );
  writeFileSync(
    join(web, "wrangler.jsonc"),
    `${JSON.stringify(
      {
        name: "flare-db-ops-fixture",
        compatibility_date: "2026-09-30",
        d1_databases: [{ binding: "DB", database_name: "fixture-prod", database_id: databaseId }],
        previews: {
          d1_databases: [
            {
              binding: "DB",
              database_name: "fixture-preview",
              database_id: "00000000-0000-0000-0000-000000000032",
            },
          ],
        },
        env: {
          development: {
            d1_databases: [
              {
                binding: "DB",
                database_name: "fixture-dev",
                database_id: "00000000-0000-0000-0000-000000000033",
              },
            ],
          },
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

interface Call {
  command: ManagedCommand;
  args: string[];
  cwd: string;
}

function makeRunner(calls: Call[]): CommandRunner {
  return (command: ManagedCommand, args: string[], options: RunOptions) => {
    calls.push({ command, args: [...args], cwd: options.cwd });
    if (command === "wrangler" && args[0] === "d1" && args[1] === "migrations") {
      if (args[2] === "list") return success("Migrations to be applied:\n001_initial.sql");
      if (args[2] === "apply") return success("Migrations applied.");
    }
    if (command === "wrangler" && args[0] === "d1" && args[1] === "execute") {
      return success("Executed seed SQL locally.");
    }
    return fail(`Unexpected fake command: ${command} ${args.join(" ")}`);
  };
}

function dependencies(
  root: string,
  runner: CommandRunner,
  confirm: (message: string) => Promise<boolean>,
  errors: string[],
): CliDependencies {
  return {
    cwd: root,
    env: { ...process.env, CLOUDFLARE_ENV: undefined },
    runner,
    confirm,
    output: {
      log: () => undefined,
      warn: () => undefined,
      error: (message?: unknown) => errors.push(typeof message === "string" ? message : ""),
    },
  };
}

async function verifyCommandResetAndRefusal(): Promise<void> {
  const fixture = createTempProject();
  try {
    const project = await loadProject(fixture.root);
    const state = join(fixture.root, ".wrangler", "state");
    mkdirSync(state, { recursive: true });
    writeFileSync(join(state, "old.sqlite"), "fixture old state", "utf8");
    const calls: Call[] = [];
    const errors: string[] = [];
    let prompt = "";
    const accepted = await commandDb(
      project,
      dependencies(
        fixture.root,
        makeRunner(calls),
        async (message) => {
          prompt = message;
          return true;
        },
        errors,
      ),
      "reset",
      ["--env", "local"],
    );
    assert.equal(accepted, 0);
    assert.match(prompt, /fixture-dev/);
    assert.match(prompt, /This deletes local rows/);
    assert.equal(existsSync(join(state, "old.sqlite")), false);
    assert.equal(existsSync(state), true);
    assert.equal(calls.length, 2);
    assert.ok(calls.every((call) => call.command === "wrangler"));
    assert.ok(calls.every((call) => call.args.includes("--local")));
    assert.ok(calls.every((call) => !call.args.includes("--remote")));
    assert.equal(calls.at(-1)?.args[2], "apply");

    const refusal = createTempProject();
    try {
      const refusalProject = await loadProject(refusal.root);
      const refusalState = join(refusal.root, ".wrangler", "state");
      mkdirSync(refusalState, { recursive: true });
      writeFileSync(join(refusalState, "preserved.sqlite"), "preserved", "utf8");
      const refusalCalls: Call[] = [];
      const refused = await commandDb(
        refusalProject,
        dependencies(refusal.root, makeRunner(refusalCalls), async () => false, errors),
        "reset",
        ["--env", "local"],
      );
      assert.equal(refused, 1);
      assert.equal(existsSync(join(refusalState, "preserved.sqlite")), true);
      assert.equal(refusalCalls.length, 0, "refusal must happen before Wrangler is called");
    } finally {
      refusal.cleanup();
    }

    const implicitCalls: Call[] = [];
    await assert.rejects(
      commandDb(
        project,
        dependencies(fixture.root, makeRunner(implicitCalls), async () => true, errors),
        "reset",
        [],
      ),
      /requires an explicit `--env local`/,
    );
    assert.equal(implicitCalls.length, 0);

    for (const environment of ["preview", "production"]) {
      const remoteCalls: Call[] = [];
      await assert.rejects(
        commandDb(
          project,
          dependencies(fixture.root, makeRunner(remoteCalls), async () => true, errors),
          "reset",
          ["--env", environment],
        ),
        /supported for local state only/,
      );
      assert.equal(remoteCalls.length, 0);
    }
  } finally {
    fixture.cleanup();
  }
}

async function verifyProjectOwnedSeed(): Promise<void> {
  const fixture = createTempProject();
  try {
    const project = await loadProject(fixture.root);
    const seedFile = join(fixture.root, "packages", "db", "seed.local.sql");
    writeFileSync(seedFile, "-- fixture-owned seed statements\n", "utf8");
    const calls: Call[] = [];
    const errors: string[] = [];
    const result = await commandDb(
      project,
      dependencies(fixture.root, makeRunner(calls), async () => true, errors),
      "seed",
      ["--env", "local"],
    );
    assert.equal(result, 0);
    assert.equal(calls.length, 1);
    const call = calls[0];
    assert.ok(call);
    assert.deepEqual(call.args.slice(0, 3), ["d1", "execute", "DB"]);
    assert.ok(call.args.includes("--local"));
    assert.equal(call.args[call.args.indexOf("--env") + 1], "development");
    assert.equal(
      call.args[call.args.indexOf("--persist-to") + 1],
      join(fixture.root, ".wrangler", "state"),
    );
    assert.equal(call.args[call.args.indexOf("--file") + 1], seedFile);
    assert.equal(call.args.includes("--remote"), false);
    assert.equal(readFileSync(seedFile, "utf8"), "-- fixture-owned seed statements\n");

    rmSync(seedFile);
    const absentCalls: Call[] = [];
    await assert.rejects(
      commandDb(
        project,
        dependencies(fixture.root, makeRunner(absentCalls), async () => true, errors),
        "seed",
        ["--env", "local"],
      ),
      /No project-owned local D1 seed script was found.*Flare never invents seed rows/,
    );
    assert.equal(absentCalls.length, 0);

    const remoteCalls: Call[] = [];
    await assert.rejects(
      commandDb(
        project,
        dependencies(fixture.root, makeRunner(remoteCalls), async () => true, errors),
        "seed",
        ["--env", "production"],
      ),
      /supported for local state only/,
    );
    assert.equal(remoteCalls.length, 0);
  } finally {
    fixture.cleanup();
  }
}

async function main(): Promise<void> {
  verifyPathGuards();
  await verifyFilesystemResetSuccess();
  await verifyFilesystemResetRecovery();
  await verifyRecoveryWithoutPreviousState();
  await verifyCommandResetAndRefusal();
  await verifyProjectOwnedSeed();
  console.log(
    "D1 local reset/seed fixtures passed (fake filesystem, fake Wrangler runner, temp project). ",
  );
}

await main();
