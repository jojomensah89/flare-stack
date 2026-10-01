import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { AuthCard } from "../components/auth-card";
import {
  AppFooter,
  AppHeader,
  CommandsSection,
  D1PersistenceCard,
  type DbItem,
  DesignSystemCard,
  HeroSection,
  ServerStatusCard,
  type ServerState,
} from "../components/demo-cards";
import { addDbItem, getDbItems, getServerStatus } from "../server/sample";

export const Route = createFileRoute("/")({
  component: IndexPage,
});

function IndexPage() {
  const [serverState, setServerState] = React.useState<ServerState | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [testInput, setTestInput] = React.useState("");

  const [dbItems, setDbItems] = React.useState<DbItem[]>([]);
  const [dbLoading, setDbLoading] = React.useState(false);
  const [newItemName, setNewItemName] = React.useState("");

  const fetchDbItems = React.useCallback(async () => {
    setDbLoading(true);
    try {
      const res = await getDbItems();
      if (res.ok && res.items) {
        setDbItems(res.items);
      }
    } catch (err) {
      console.error("Failed to fetch D1 items", err);
    } finally {
      setDbLoading(false);
    }
  }, []);

  const fetchServerStatus = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await getServerStatus();
      setServerState(data);
    } catch (err) {
      console.error("Failed to fetch server status", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInsertDbItem = React.useCallback(async () => {
    if (!newItemName.trim()) return;
    try {
      await addDbItem({ data: newItemName.trim() });
      setNewItemName("");
      await fetchDbItems();
    } catch {
      console.error("Failed to insert reference item");
    }
  }, [newItemName, fetchDbItems]);

  React.useEffect(() => {
    void fetchServerStatus();
    void fetchDbItems();
  }, [fetchServerStatus, fetchDbItems]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-6 md:p-12">
      <div className="w-full max-w-5xl space-y-10">
        <AppHeader onRefreshStatus={() => void fetchServerStatus()} />
        <HeroSection />

        <div className="grid gap-6 md:grid-cols-2">
          <ServerStatusCard
            serverState={serverState}
            loading={loading}
            onRefresh={() => void fetchServerStatus()}
          />
          <DesignSystemCard testInput={testInput} onTestInputChange={setTestInput} />
          <D1PersistenceCard
            items={dbItems}
            loading={dbLoading}
            newItemName={newItemName}
            onNewItemNameChange={setNewItemName}
            onInsert={() => void handleInsertDbItem()}
            onRefresh={() => void fetchDbItems()}
          />
          <AuthCard />
        </div>

        <CommandsSection />
        <AppFooter />
      </div>
    </main>
  );
}
