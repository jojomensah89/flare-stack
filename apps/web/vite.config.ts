import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import {
  cloudflareStaticHeaders,
  requireFlareEnvironment,
  type FlareEnvironment,
} from "./src/server/security";

function staticSecurityHeadersPlugin(environment: FlareEnvironment): Plugin {
  return {
    name: "flare-static-security-headers",
    apply: "build",
    generateBundle(outputOptions) {
      if (!outputOptions.dir || !/[\\/]client$/i.test(outputOptions.dir)) {
        return;
      }
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
      cloudflare({
        viteEnvironment: { name: "ssr" },
        persistState: { path: "../../.wrangler/state" },
      }),
      tailwindcss(),
      tanstackStart({ server: { entry: "server/entry.ts" } }),
      react(),
      staticSecurityHeadersPlugin(buildEnvironment),
    ],
  };
});
