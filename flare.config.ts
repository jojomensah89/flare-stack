import { defineFlareConfig } from "flare";

export default defineFlareConfig({
  schemaVersion: 1,
  flareVersion: "0.14.1",
  productionBranch: "main",
  preset: "app",
  database: "d1",
  auth: "better-auth",
  observability: "evlog",
  uiLint: "shadcn",
  capabilities: [],
  deployment: {
    provider: "cloudflare",
    productionBranch: "main",
  },
});
