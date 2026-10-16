import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

function staticHeaders(): Plugin {
  return {
    name: "flare-site-static-headers",
    apply: "build",
    generateBundle(outputOptions) {
      if (!outputOptions.dir || !/[\\/]client$/i.test(outputOptions.dir)) {
        return;
      }
      this.emitFile({
        type: "asset",
        fileName: "_headers",
        source: [
          "/*",
          "  X-Content-Type-Options: nosniff",
          "  Referrer-Policy: strict-origin-when-cross-origin",
          "  Permissions-Policy: camera=(), microphone=(), geolocation=()",
          "  X-Frame-Options: DENY",
          "  Content-Security-Policy: default-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
          "",
        ].join("\n"),
      });
    },
  };
}

export default defineConfig(({ command }) => ({
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    tailwindcss(),
    react(),
    ...(command === "build"
      ? [
          cloudflare({
            viteEnvironment: { name: "worker" },
            persistState: { path: "../../.wrangler/state" },
          }),
        ]
      : []),
    staticHeaders(),
  ],
  preview: {
    port: 4173,
    outDir: "dist/client",
  },
}));
