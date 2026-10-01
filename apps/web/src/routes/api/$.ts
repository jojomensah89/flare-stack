import { app as serverApp } from "@repo/server";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/$")({
  server: {
    handlers: {
      GET: async ({ request }) => serverApp.fetch(request),
      POST: async ({ request }) => serverApp.fetch(request),
      PUT: async ({ request }) => serverApp.fetch(request),
      DELETE: async ({ request }) => serverApp.fetch(request),
      PATCH: async ({ request }) => serverApp.fetch(request),
    },
  },
});
