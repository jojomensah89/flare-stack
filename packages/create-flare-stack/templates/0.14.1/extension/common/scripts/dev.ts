import { spawn } from "node:child_process";

const child = spawn("bun", ["--filter", "@repo/extension", "dev"], {
  stdio: "inherit",
  shell: true,
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
