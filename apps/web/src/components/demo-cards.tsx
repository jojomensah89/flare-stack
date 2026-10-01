import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Label,
  Separator,
  Skeleton,
  Tooltip,
} from "@repo/ui";
import {
  Activity,
  CheckCircle2,
  ChevronDown,
  Database,
  Flame,
  Info,
  Layers,
  Network,
  Server,
  Terminal,
} from "lucide-react";

export interface ServerState {
  status: string;
  runtime: string;
  framework: string;
  timestamp: string;
  preset: string;
  database?: string;
}

export interface DbItem {
  id: string;
  name: string;
  createdAt: Date;
}

export interface AppHeaderProps {
  onRefreshStatus: () => void;
}

export function AppHeader({ onRefreshStatus }: AppHeaderProps) {
  return (
    <header className="flex items-center justify-between border-b border-border pb-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow">
          <Flame className="h-6 w-6 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">Flare Stack</h1>
          <p className="text-xs text-muted-foreground">
            First-party Reference Application (Phase 1)
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Tooltip content={<p>Minimal health check endpoint</p>}>
          <a
            href="/health"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-sm hover:bg-accent hover:text-accent-foreground"
          >
            <Activity className="h-3.5 w-3.5" />
            <span>/health</span>
          </a>
        </Tooltip>

        <DropdownMenu>
          <DropdownMenuTrigger>
            <Button variant="outline" size="sm">
              <span>Actions</span>
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={onRefreshStatus}>Refresh Server Status</DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => alert("Flare Stack: Opinionated Cloudflare Architecture")}
            >
              About Flare
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

export function HeroSection() {
  return (
    <section className="space-y-4 text-center md:text-left">
      <div className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
        <span className="flex h-2 w-2 rounded-full bg-primary" />
        <span>Preset: app (TanStack Start + Cloudflare Workers)</span>
      </div>
      <h2 className="text-3xl font-extrabold tracking-tight md:text-5xl">
        Cloudflare-First Architecture
      </h2>
      <p className="max-w-2xl text-base text-muted-foreground md:text-lg">
        A reference stack with Bun workspaces, Turborepo, strict TypeScript, TanStack Start, React
        19, Cloudflare Vite, Tailwind v4, shadcn/ui, and structured evlog observability.
      </p>
    </section>
  );
}

export interface ServerStatusCardProps {
  serverState: ServerState | null;
  loading: boolean;
  onRefresh: () => void;
}

export function ServerStatusCard({ serverState, loading, onRefresh }: ServerStatusCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>TanStack Start Server Function</CardTitle>
          <Server className="h-5 w-5 text-muted-foreground" />
        </div>
        <CardDescription>Live RPC execution via createServerFn logged with evlog</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ) : serverState ? (
            <div className="space-y-2 rounded-lg border border-border bg-muted/50 p-4 font-mono text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status:</span>
                <span className="font-semibold text-primary">{serverState.status}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Runtime:</span>
                <span>{serverState.runtime}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Framework:</span>
                <span>{serverState.framework}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Timestamp:</span>
                <span>{serverState.timestamp}</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No data received from server function.</p>
          )}

          <div className="flex items-center gap-2">
            <Button size="sm" onClick={onRefresh} disabled={loading}>
              Execute Server Function
            </Button>
            <Dialog>
              <DialogTrigger>
                <Button variant="outline" size="sm">
                  Inspect Diagnostics
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Worker Runtime Diagnostics</DialogTitle>
                  <DialogDescription>
                    Details on the Cloudflare Workers Vite SSR environment.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3 py-2 text-sm">
                  <div className="flex justify-between border-b border-border py-1">
                    <span className="text-muted-foreground">Compatibility Date:</span>
                    <span className="font-mono text-xs">2026-09-30</span>
                  </div>
                  <div className="flex justify-between border-b border-border py-1">
                    <span className="text-muted-foreground">Flags:</span>
                    <span className="font-mono text-xs">nodejs_compat</span>
                  </div>
                  <div className="flex justify-between border-b border-border py-1">
                    <span className="text-muted-foreground">Config Format:</span>
                    <span className="font-mono text-xs">wrangler.jsonc</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-muted-foreground">Observability:</span>
                    <span className="font-mono text-xs">evlog structured events</span>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export interface DesignSystemCardProps {
  testInput: string;
  onTestInputChange: (value: string) => void;
}

export function DesignSystemCard({ testInput, onTestInputChange }: DesignSystemCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Design System & UI Controls</CardTitle>
          <Layers className="h-5 w-5 text-muted-foreground" />
        </div>
        <CardDescription>
          Base UI primitives styled with Tailwind CSS v4 and validated by @shadcn/lint
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="demo-input">Interactive Input</Label>
            <div className="flex gap-2">
              <Input
                id="demo-input"
                placeholder="Enter test value..."
                value={testInput}
                onChange={(e) => onTestInputChange(e.target.value)}
              />
              <Button variant="secondary" onClick={() => onTestInputChange("")}>
                Clear
              </Button>
            </div>
          </div>

          {testInput ? (
            <p className="text-xs text-muted-foreground">
              Current input: <span className="font-medium text-foreground">{testInput}</span>
            </p>
          ) : null}

          <Separator />

          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <span className="text-xs text-muted-foreground">
              Zero design-system lint violations (@shadcn/lint verified)
            </span>
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <span className="text-xs text-muted-foreground">
          Exemptions strictly isolated to packages/ui implementation layer
        </span>
      </CardFooter>
    </Card>
  );
}

export interface D1PersistenceCardProps {
  items: DbItem[];
  loading: boolean;
  newItemName: string;
  onNewItemNameChange: (value: string) => void;
  onInsert: () => void;
  onRefresh: () => void;
}

export function D1PersistenceCard({
  items,
  loading,
  newItemName,
  onNewItemNameChange,
  onInsert,
  onRefresh,
}: D1PersistenceCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Cloudflare D1 Persistence</CardTitle>
          <Database className="h-5 w-5 text-muted-foreground" />
        </div>
        <CardDescription>
          Drizzle ORM SQLite operations backed by canonical .wrangler/state
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="item-input">Insert New D1 Row</Label>
            <div className="flex gap-2">
              <Input
                id="item-input"
                placeholder="Item name..."
                value={newItemName}
                onChange={(e) => onNewItemNameChange(e.target.value)}
              />
              <Button size="sm" onClick={onInsert} disabled={loading}>
                Insert
              </Button>
              <Button variant="secondary" size="sm" onClick={onRefresh} disabled={loading}>
                Refresh
              </Button>
            </div>
          </div>

          <div className="space-y-2 rounded-lg border border-border bg-muted/50 p-4 font-mono text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Stored Items:</span>
              <span className="font-semibold text-primary">{items.length}</span>
            </div>
            {items.length > 0 ? (
              <div className="space-y-1 pt-2">
                {items.slice(0, 3).map((item) => (
                  <div key={item.id} className="flex justify-between text-muted-foreground">
                    <span className="truncate">{item.name}</span>
                    <span className="font-mono text-xs">
                      {new Date(item.createdAt).toISOString().slice(11, 19)} UTC
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="pt-1 text-muted-foreground italic">No items stored in D1 yet.</p>
            )}
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <span className="text-xs text-muted-foreground">
          Shared canonical persistence between bun db:migrate and runtime
        </span>
      </CardFooter>
    </Card>
  );
}

export interface ServiceBindingItem {
  id: string;
  name: string;
}

export interface ServiceBindingCardProps {
  items: ServiceBindingItem[];
  loading: boolean;
  onFetchClientRpc: () => void;
  onFetchServerFn: () => void;
  status: string | null;
}

export function ServiceBindingCard({
  items,
  loading,
  onFetchClientRpc,
  onFetchServerFn,
  status,
}: ServiceBindingCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Service Binding & Hono RPC</CardTitle>
          <Network className="h-5 w-5 text-muted-foreground" />
        </div>
        <CardDescription>
          Zero-latency Cloudflare Service Binding connecting TanStack Start to Hono backend Worker
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={onFetchClientRpc} disabled={loading}>
              Client RPC (/api/items)
            </Button>
            <Button variant="secondary" size="sm" onClick={onFetchServerFn} disabled={loading}>
              Server Fn (Service Binding)
            </Button>
          </div>

          <div className="space-y-2 rounded-lg border border-border bg-muted/50 p-4 font-mono text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Mode:</span>
              <span className="font-semibold text-primary">{status ?? "Idle"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Backend Items:</span>
              <span className="font-semibold">{items.length}</span>
            </div>
            {items.length > 0 ? (
              <div className="space-y-1 pt-2">
                {items.map((item) => (
                  <div key={item.id} className="flex justify-between text-muted-foreground">
                    <span className="truncate">{item.name}</span>
                    <span className="font-mono text-xs text-primary">{item.id}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="pt-1 text-muted-foreground italic">
                Click a button above to fetch items from the backend Worker.
              </p>
            )}
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <span className="text-xs text-muted-foreground">
          Type-safe RPC contract shared via @repo/server/contract with zero code duplication
        </span>
      </CardFooter>
    </Card>
  );
}

export function CommandsSection() {
  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-center gap-2">
        <Terminal className="h-5 w-5 text-primary" />
        <h3 className="text-base font-semibold">Standard Working Commands</h3>
      </div>
      <div className="grid gap-3 text-xs md:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-border p-3">
          <div className="font-mono font-bold text-foreground">bun setup</div>
          <p className="mt-1 text-muted-foreground">
            Installs Lefthook hooks, initializes .wrangler/state, generates Cloudflare types.
          </p>
        </div>
        <div className="rounded-lg border border-border p-3">
          <div className="font-mono font-bold text-foreground">bun dev</div>
          <p className="mt-1 text-muted-foreground">
            Runs local development server via Vite and TanStack Start.
          </p>
        </div>
        <div className="rounded-lg border border-border p-3">
          <div className="font-mono font-bold text-foreground">bun check</div>
          <p className="mt-1 text-muted-foreground">
            Checks Oxfmt formatting, Oxlint with @shadcn/lint, and strict TypeScript.
          </p>
        </div>
        <div className="rounded-lg border border-border p-3">
          <div className="font-mono font-bold text-foreground">bun run build</div>
          <p className="mt-1 text-muted-foreground">
            Compiles production build for Cloudflare Workers without bare bundler collisions.
          </p>
        </div>
      </div>
    </section>
  );
}

export function AppFooter() {
  return (
    <footer className="flex flex-col items-center justify-between gap-4 border-t border-border pt-6 text-xs text-muted-foreground md:flex-row">
      <p>Flare Stack v0.14.1 - Reference Application</p>
      <div className="flex items-center gap-4">
        <span className="inline-flex items-center gap-1">
          <Info className="h-3.5 w-3.5" />
          <span>Strictly zero test-framework bloat in base scaffold</span>
        </span>
      </div>
    </footer>
  );
}
