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
      { title: "{{PROJECT_NAME}} | Flare Stack" },
      {
        name: "description",
        content: "A TanStack Start application running on Cloudflare Workers.",
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
