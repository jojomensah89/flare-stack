import { spawnSync } from "node:child_process";

const result = spawnSync(process.execPath, ["run", "--filter", "@repo/server", "dev"], {
  env: { ...process.env, CLOUDFLARE_ENV: "development" },
  shell: false,
  stdio: "inherit",
});

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
