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
import { addDbItem, getDbItems, getServerStatus } from "../server/sample";

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

  const refreshItems = React.useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setItems(await getDbItems());
    } catch {
      setError("Could not load D1 items. Check the local database migration and binding.");
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
      setError("Could not save the item to D1. Check the local database migration and binding.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center gap-8 px-6 py-12 md:px-10">
      <header className="space-y-4">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">
          Flare Stack · app + D1
        </p>
        <h1 className="text-4xl font-bold tracking-tight md:text-6xl">{{ PROJECT_NAME }}</h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          A small TanStack Start app on Cloudflare Workers with a Drizzle-backed D1 database.
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

        <Card>
          <CardHeader>
            <CardTitle>
              <span className="flex items-center gap-2">
                <Database aria-hidden="true" className="size-5" /> D1 sample
              </span>
            </CardTitle>
            <CardDescription>Store a short item using Drizzle and the DB binding.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <form
                className="flex flex-col gap-3 sm:flex-row sm:items-end"
                onSubmit={(event) => void handleSubmit(event)}
              >
                <div className="flex-1 space-y-2">
                  <Label htmlFor="item-name">Item name</Label>
                  <Input
                    id="item-name"
                    maxLength={120}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </div>
                <Button disabled={busy || !name.trim()} type="submit">
                  {busy ? "Saving…" : "Save item"}
                </Button>
              </form>
              <div aria-live="polite" className="space-y-2 text-sm">
                {error ? <p className="text-destructive">{error}</p> : null}
                {items.length ? (
                  <ul className="divide-y divide-border rounded-md border border-border">
                    {items.map((item) => (
                      <li className="flex justify-between gap-3 px-3 py-2" key={item.id}>
                        <span className="truncate">{item.name}</span>
                        <time
                          className="shrink-0 text-muted-foreground"
                          dateTime={item.createdAt.toISOString()}
                        >
                          {item.createdAt.toLocaleDateString()}
                        </time>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground">
                    {busy ? "Loading items…" : "No items saved yet."}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <a className="text-sm font-medium underline underline-offset-4" href="/health">
        Check worker health
      </a>
    </main>
  );
}
