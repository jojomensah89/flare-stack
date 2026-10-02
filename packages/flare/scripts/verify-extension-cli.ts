import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { runCli, type CliDependencies } from "../src/cli";

const root = mkdtempSync(join(tmpdir(), "flare-extension-cli-"));
const resolvedRoot = resolve(root);
assert.equal(dirname(resolvedRoot), resolve(tmpdir()));
assert.ok(basename(root).startsWith("flare-extension-cli-"));

try {
  writeFileSync(
    join(root, "flare.config.ts"),
    `export default ${JSON.stringify(
      {
        schemaVersion: 1,
        flareVersion: "0.14.1",
        productionBranch: "main",
        preset: "extension",
        database: "none",
        auth: "none",
        observability: "none",
        uiLint: "none",
        capabilities: [],
        deployment: { provider: "cloudflare", productionBranch: "main" },
      },
      null,
      2,
    )};\n`,
    "utf8",
  );
  writeFileSync(join(root, ".gitignore"), "node_modules\n.dev.vars\n.preview.vars\n", "utf8");

  const runnerCalls: string[] = [];
  const errors: string[] = [];
  const dependencies: CliDependencies = {
    cwd: root,
    runner: (command, args) => {
      runnerCalls.push(`${command} ${args.join(" ")}`);
      return { status: 0, stdout: "unexpected external command", stderr: "" };
    },
    output: {
      log: () => undefined,
      warn: () => undefined,
      error: (message) => errors.push(String(message)),
    },
  };

  const unsupportedCommands = [
    ["doctor"],
    ["doctor", "--remote"],
    ["logs"],
    ["tail"],
    ["setup", "cloudflare"],
    ["deploy"],
    ["preview"],
    ["db", "status"],
    ["secrets", "list"],
    ["env", "check"],
    ["rollback"],
  ];

  for (const command of unsupportedCommands) {
    errors.length = 0;
    const status = await runCli(command, dependencies);
    assert.notEqual(status, 0, `${command.join(" ")} must fail for the extension preset`);
    assert.ok(
      errors.some((message) => message.includes("extension preset")),
      `${command.join(" ")} must explain the extension lifecycle boundary`,
    );
    assert.equal(
      runnerCalls.length,
      0,
      `${command.join(" ")} must fail before invoking Wrangler or another managed command`,
    );
  }

  console.log(
    `Extension lifecycle guards passed: ${unsupportedCommands.length} unsupported commands failed before managed commands were invoked.`,
  );
} finally {
  rmSync(resolvedRoot, { recursive: true, force: true });
}
