import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import {
  cloudflareStaticHeaders,
  requireFlareEnvironment,
  type FlareEnvironment,
} from "./src/security";

function staticSecurityHeadersPlugin(environment: FlareEnvironment): Plugin {
  return {
    name: "flare-static-security-headers",
    apply: "build",
    generateBundle(outputOptions) {
      if (!outputOptions.dir || !/[\\/]client$/i.test(outputOptions.dir)) return;
      this.emitFile({
        type: "asset",
        fileName: "_headers",
        source: cloudflareStaticHeaders(environment),
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const buildEnvironment = requireFlareEnvironment(
    process.env.FLARE_ENVIRONMENT ?? (mode === "preview" ? "preview" : "production"),
  );

  return {
    plugins: [
      tanstackRouter({ target: "react", autoCodeSplitting: true }),
      tailwindcss(),
      react(),
      cloudflare({
        viteEnvironment: { name: "worker" },
        persistState: { path: "../../.wrangler/state" },
        auxiliaryWorkers: [{ configPath: "../server/wrangler.jsonc" }],
      }),
      staticSecurityHeadersPlugin(buildEnvironment),
    ],
  };
});
