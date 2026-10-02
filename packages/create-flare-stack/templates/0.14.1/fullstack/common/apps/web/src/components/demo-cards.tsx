import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui";
import { Network } from "lucide-react";
import * as React from "react";

export interface ServiceBindingItem {
  id: string;
  name: string;
}

export function ServiceBindingCard({
  items,
  loading,
  status,
  onFetchClientRpc,
  onFetchServerFn,
}: {
  items: ServiceBindingItem[];
  loading: boolean;
  status: string | null;
  onFetchClientRpc: () => void;
  onFetchServerFn: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span className="flex items-center gap-2">
            <Network aria-hidden="true" className="size-5" /> Service Binding (Hono RPC)
          </span>
        </CardTitle>
        <CardDescription>
          Communicate with the backend worker via direct Service Binding or browser RPC.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button disabled={loading} variant="outline" onClick={onFetchClientRpc}>
              Client RPC (/api/items)
            </Button>
            <Button disabled={loading} onClick={onFetchServerFn}>
              Server Fn (Service Binding)
            </Button>
          </div>
          {status && <p className="text-xs text-muted-foreground">Source: {status}</p>}
          {items.length > 0 ? (
            <ul className="space-y-1 text-sm">
              {items.map((item) => (
                <li key={item.id} className="flex justify-between rounded bg-muted/50 px-2 py-1">
                  <span>{item.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{item.id}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">No items fetched yet.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
