import { Context, Effect } from "effect";

export type Item = { id: string; name: string; createdAt: string };

export class ItemStoreError extends Error {
  readonly _tag = "ItemStoreError";

  constructor(cause: unknown) {
    super("The item store failed.", { cause });
    this.name = "ItemStoreError";
  }
}

interface ItemStoreService {
  list(): Effect.Effect<Item[], ItemStoreError>;
  create(name: string): Effect.Effect<Item, ItemStoreError>;
}

export class ItemStore extends Context.Tag("flare/ItemStore")<ItemStore, ItemStoreService>() {}

interface AuthHandlerService {
  handle(request: Request): Effect.Effect<Response, Error>;
}

export class AuthHandler extends Context.Tag("flare/AuthHandler")<
  AuthHandler,
  AuthHandlerService
>() {}

export function listItems() {
  return Effect.flatMap(ItemStore, (store) => store.list());
}

export function createItem(name: string) {
  return Effect.flatMap(ItemStore, (store) => store.create(name));
}

export function handleAuthRequest(request: Request) {
  return Effect.flatMap(AuthHandler, (handler) => handler.handle(request));
}
