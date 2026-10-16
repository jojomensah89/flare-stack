import { appendFileSync } from "node:fs";
import config from "../flare.config";

const supported = config.preset === "app" || config.preset === "worker";
const hasCredentials = Boolean(
  process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID,
);
const allowed = supported && hasCredentials;
if (!supported) {
  console.log(
    "Branch Worker Previews are disabled for this topology. Fullstack uses a shared persistent preview pair; run bun preview explicitly.",
  );
} else if (!hasCredentials) {
  console.log("Branch Worker Preview skipped: Cloudflare credentials are not configured.");
}
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `allowed=${allowed}\n`);
}
