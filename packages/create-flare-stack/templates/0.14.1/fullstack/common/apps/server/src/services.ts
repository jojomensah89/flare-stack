import { Effect, Layer } from "effect";
import type { ServerBindings } from "./env";
import { ItemStore, type Item } from "./service-tags";
export {
  AuthHandler,
  createItem,
  handleAuthRequest,
  ItemStore,
  ItemStoreError,
  listItems,
  type Item,
} from "./service-tags";

export function makeItemStoreLayer(_bindings: ServerBindings): Layer.Layer<ItemStore> {
  const items: Item[] = [
    { id: "welcome-1", name: "Your first item", createdAt: new Date(0).toISOString() },
    { id: "welcome-2", name: "A typed HTTP API", createdAt: new Date(0).toISOString() },
  ];
  return Layer.succeed(ItemStore, {
    list: () => Effect.succeed(items.map((item) => ({ ...item }))),
    create: (name) =>
      Effect.sync(() => {
        const item = { id: crypto.randomUUID(), name, createdAt: new Date().toISOString() };
        items.unshift(item);
        return item;
      }),
  });
}
