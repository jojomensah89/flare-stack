import {
  buttonVariants,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowUpRight, Cloud, Server } from "lucide-react";
import * as React from "react";
import { ServiceBindingCard, type ServiceBindingItem } from "../components/demo-cards";
import { getServerBackendItems, getServerStatus } from "../server/sample";

export const Route = createFileRoute("/")({
  loader: () => getServerStatus(),
  component: IndexPage,
});

function IndexPage() {
  const status = Route.useLoaderData();
  const [sbItems, setSbItems] = React.useState<ServiceBindingItem[]>([]);
  const [sbLoading, setSbLoading] = React.useState(false);
  const [sbStatus, setSbStatus] = React.useState<string | null>(null);

  const fetchClientRpc = React.useCallback(async () => {
    setSbLoading(true);
    try {
      const res = await fetch("/api/items");
      if (res.ok) {
        const data = (await res.json()) as { items: ServiceBindingItem[] };
        setSbItems(data.items);
        setSbStatus("Client RPC (/api/items)");
      }
    } catch (err) {
      console.error("Failed to fetch backend items via client RPC", err);
      setSbStatus("Client RPC Error");
    } finally {
      setSbLoading(false);
    }
  }, []);

  const fetchServerFn = React.useCallback(async () => {
    setSbLoading(true);
    try {
      const res = await getServerBackendItems();
      if (res.ok && res.items) {
        setSbItems(res.items);
        setSbStatus("Server Fn (Service Binding RPC)");
      }
    } catch (err) {
      console.error("Failed to fetch backend items via server fn", err);
      setSbStatus("Server Fn Error");
    } finally {
      setSbLoading(false);
    }
  }, []);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center gap-10 px-6 py-12 md:px-10">
      <header className="space-y-5">
        <div className="flex items-center gap-3 text-primary">
          <Cloud aria-hidden="true" className="size-7" />
          <span className="text-sm font-semibold uppercase tracking-wide">
            Flare Stack · Fullstack
          </span>
        </div>
        <h1 className="max-w-3xl text-4xl font-bold tracking-tight md:text-6xl">
          {{ PROJECT_NAME }}
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          TanStack Start frontend and Hono backend connected via Cloudflare Service Binding.
        </p>
        <a className={buttonVariants()} href="/api/health" target="_blank" rel="noreferrer">
          Check API health <ArrowUpRight aria-hidden="true" className="size-4" />
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

        <ServiceBindingCard
          items={sbItems}
          loading={sbLoading}
          status={sbStatus}
          onFetchClientRpc={() => {
            void fetchClientRpc();
          }}
          onFetchServerFn={() => {
            void fetchServerFn();
          }}
        />
      </section>
    </main>
  );
}
