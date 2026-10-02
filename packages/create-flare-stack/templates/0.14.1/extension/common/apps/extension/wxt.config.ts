import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifestVersion: 3,
  targetBrowsers: ["chrome", "firefox", "edge"],
  modules: ["@wxt-dev/module-react"],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: "{{PROJECT_NAME}}",
    description: "Browser extension built with Flare Stack, WXT, and React 19.",
    version: "0.1.0",
    permissions: ["storage"],
    action: {
      default_title: "{{PROJECT_NAME}}",
    },
  },
});
