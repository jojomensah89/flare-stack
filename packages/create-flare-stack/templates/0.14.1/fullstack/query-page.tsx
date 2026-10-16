import { Button, Input, Label } from "@repo/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { apiClient, ApiHttpError } from "../lib/api-client";
// AUTH_IMPORT

export const Route = createFileRoute("/")({ component: IndexPage });
const itemKey = ["items"] as const;

function IndexPage() {
  const [name, setName] = useState("");
  const client = useQueryClient();
  const items = useQuery({
    queryKey: itemKey,
    queryFn: ({ signal }) => apiClient.items(signal),
    enabled: typeof window !== "undefined",
    staleTime: 30_000,
    retry: (count, error) => !(error instanceof ApiHttpError && error.status < 500) && count < 2,
  });
  const create = useMutation({
    mutationFn: apiClient.createItem,
    retry: false,
    onSuccess: async () => {
      setName("");
      await client.invalidateQueries({ queryKey: itemKey });
    },
  });
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="space-y-3">
        <h1 className="text-4xl font-bold">{{ PROJECT_NAME }}</h1>
        <p className="text-muted-foreground">
          React and TanStack Query, backed by Effect services through a private Hono HTTP Worker.
        </p>
      </header>
      <section className="space-y-4 rounded-lg border border-border p-6">
        <h2 className="text-xl font-semibold">Items</h2>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate({ name });
          }}
        >
          <Label htmlFor="item-name">Item name</Label>
          <Input
            id="item-name"
            value={name}
            maxLength={120}
            required
            onChange={(event) => setName(event.target.value)}
          />
          <Button type="submit" disabled={create.isPending || !name.trim()}>
            {create.isPending ? "Adding…" : "Add item"}
          </Button>
        </form>
        {create.error && (
          <p role="alert" className="text-destructive">
            {create.error.message}
          </p>
        )}
        {items.isPending && <p role="status">Loading items…</p>}
        {items.error && (
          <p role="alert" className="text-destructive">
            {items.error.message}
          </p>
        )}
        <ul className="space-y-2">
          {items.data?.items.map((item) => (
            <li key={item.id}>{item.name}</li>
          ))}
        </ul>
      </section>
      {/* AUTH_CARD */}
    </main>
  );
}
