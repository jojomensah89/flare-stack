/// <reference types="vite/client" />
import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "@tanstack/react-router";
import appCss from "../styles/app.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Flare Stack - Reference App" },
      {
        name: "description",
        content:
          "Cloudflare-first TanStack Start reference application built with Flare Stack conventions.",
      },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
