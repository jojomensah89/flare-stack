import { spawnSync } from "node:child_process";
import { join } from "node:path";

const extensionDirectory = join(import.meta.dir, "..", "apps", "extension");
const browsers = ["chrome", "firefox", "edge"] as const;

for (const browser of browsers) {
  console.log(`Packaging the ${browser} Manifest V3 extension...`);
  const result = spawnSync(process.execPath, ["run", `zip:${browser}`], {
    cwd: extensionDirectory,
    stdio: "inherit",
    shell: false,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
