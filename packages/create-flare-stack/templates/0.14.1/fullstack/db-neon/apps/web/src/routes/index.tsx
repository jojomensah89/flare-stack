import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from "@repo/ui";
import { createFileRoute } from "@tanstack/react-router";
import { Database, Server } from "lucide-react";
import * as React from "react";
import { ServiceBindingCard, type ServiceBindingItem } from "../components/demo-cards";
import { addDbItem, getDbItems, getServerBackendItems, getServerStatus } from "../server/sample";

export const Route = createFileRoute("/")({
  loader: () => getServerStatus(),
  component: IndexPage,
});

type StoredItem = Awaited<ReturnType<typeof getDbItems>>[number];

function IndexPage() {
  const status = Route.useLoaderData();
  const [items, setItems] = React.useState<StoredItem[]>([]);
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [sbItems, setSbItems] = React.useState<ServiceBindingItem[]>([]);
  const [sbLoading, setSbLoading] = React.useState(false);
  const [sbStatus, setSbStatus] = React.useState<string | null>(null);

  const refreshItems = React.useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setItems(await getDbItems());
    } catch {
      setError("Could not load Neon items. Check the local database migration and DATABASE_URL.");
    } finally {
      setBusy(false);
    }
  }, []);

  React.useEffect(() => {
    void refreshItems();
  }, [refreshItems]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || busy) return;
    setBusy(true);
    setError(null);
    try {
      await addDbItem({ data: trimmedName });
      setName("");
      setItems(await getDbItems());
    } catch {
      setError(
        "Could not save the item to Neon. Check the local database migration and DATABASE_URL.",
      );
    } finally {
      setBusy(false);
    }
  }

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
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center gap-8 px-6 py-12 md:px-10">
      <header className="space-y-4">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">
          Flare Stack · Fullstack + Neon
        </p>
        <h1 className="text-4xl font-bold tracking-tight md:text-6xl">{{ PROJECT_NAME }}</h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          TanStack Start frontend, dedicated Hono backend, and Drizzle-backed Neon Postgres
          database.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              <span className="flex items-center gap-2">
                <Server aria-hidden="true" className="size-5" /> Worker status
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
          onFetchClientRpc={fetchClientRpc}
          onFetchServerFn={fetchServerFn}
        />

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>
              <span className="flex items-center gap-2">
                <Database aria-hidden="true" className="size-5" /> Neon records
              </span>
            </CardTitle>
            <CardDescription>
              Persisted in Neon Postgres via Drizzle ORM through TanStack server functions.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form className="flex gap-2" onSubmit={handleSubmit}>
              <div className="flex-1 space-y-1">
                <Label className="sr-only" htmlFor="neon-item-name">
                  Item name
                </Label>
                <Input
                  id="neon-item-name"
                  placeholder="Enter a new item name..."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <Button disabled={busy || !name.trim()} type="submit">
                {busy ? "Saving..." : "Add item"}
              </Button>
            </form>

            {error && <p className="text-sm text-destructive">{error}</p>}

            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">No items in the database yet.</p>
            ) : (
              <ul className="space-y-2">
                {items.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                  >
                    <span>{item.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">{item.id}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
