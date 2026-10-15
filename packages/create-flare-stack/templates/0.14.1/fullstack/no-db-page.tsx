import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { apiClient, ApiHttpError } from "../lib/api-client";

export const Route = createFileRoute("/")({ component: IndexPage });

function IndexPage() {
  const health = useQuery({
    queryKey: ["health"],
    queryFn: ({ signal }) => apiClient.health(signal),
    enabled: typeof window !== "undefined",
    retry: (count, error) => !(error instanceof ApiHttpError && error.status < 500) && count < 2,
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-6 py-12">
      <p className="text-sm font-semibold uppercase tracking-wide text-primary">
        Flare Stack · Fullstack
      </p>
      <h1 className="text-4xl font-bold tracking-tight">{{ PROJECT_NAME }}</h1>
      <p className="max-w-2xl text-lg text-muted-foreground">
        A React frontend calls a private Hono API Worker. Effect services handle backend workflows.
      </p>
      <p role="status" className="text-sm text-muted-foreground">
        {health.isPending
          ? "Checking the API…"
          : health.error
            ? health.error.message
            : "The API is ready."}
      </p>
      <a className="text-primary underline underline-offset-4" href="/api/health">
        Open the API health response
      </a>
    </main>
  );
}
