import {
  buttonVariants,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, Cloud, Server } from "lucide-react";
import { getServerStatus } from "../server/sample";

export const Route = createFileRoute("/")({
  loader: () => getServerStatus(),
  component: IndexPage,
});

function IndexPage() {
  const status = Route.useLoaderData();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center gap-10 px-6 py-12 md:px-10">
      <header className="space-y-5">
        <div className="flex items-center gap-3 text-primary">
          <Cloud aria-hidden="true" className="size-7" />
          <span className="text-sm font-semibold uppercase tracking-wide">Flare Stack</span>
        </div>
        <h1 className="max-w-3xl text-4xl font-bold tracking-tight md:text-6xl">
          {{ PROJECT_NAME }}
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          Your application is running on TanStack Start and Cloudflare Workers. Start building from
          this small, typed foundation.
        </p>
        <a className={buttonVariants()} href="/health" target="_blank" rel="noreferrer">
          Check worker health <ArrowUpRight aria-hidden="true" className="size-4" />
        </a>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              <span className="flex items-center gap-2">
                <Server aria-hidden="true" className="size-5" />
                Worker status
              </span>
            </CardTitle>
            <CardDescription>Returned by a TanStack server function.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <p>
                <span className="font-medium">Status:</span> {status.status}
              </p>
              <p>
                <span className="font-medium">Runtime:</span> {status.runtime}
              </p>
              <p>
                <span className="font-medium">Framework:</span> {status.framework}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Continue building</CardTitle>
            <CardDescription>
              Start local development, then check and build before deploying.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>Use the generated project instructions and profile skills as you add features.</p>
              <Link
                className="font-medium text-foreground underline underline-offset-4"
                to="/health"
              >
                Open the health route
              </Link>
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
