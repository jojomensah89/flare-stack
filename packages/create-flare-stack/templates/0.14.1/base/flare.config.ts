import { defineFlareConfig } from "flare";

export default defineFlareConfig({
  schemaVersion: 1,
  flareVersion: "{{FLARE_VERSION}}",
  productionBranch: "main",
  preset: "{{PRESET}}",
  // {{FRONTEND_CONFIG}}
  database: "{{DATABASE}}",
  auth: "{{AUTH}}",
  observability: "evlog",
  uiLint: "shadcn",
  capabilities: [],
  deployment: {
    provider: "cloudflare",
    productionBranch: "main",
  },
});
