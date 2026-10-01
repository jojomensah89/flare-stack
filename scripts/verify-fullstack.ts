import assert from "node:assert/strict";
import { hc } from "hono/client";
import { app, type AppType } from "../apps/server/src/index";

// In-memory contract evidence only. Real Service Bindings and deployed preview
// isolation are release gates before fullstack can be advertised as supported.
const client = hc<AppType>("https://fixture.example", {
  fetch: async (input: RequestInfo | URL, init?: RequestInit) =>
    app.request(new Request(input, init)),
});
const health = await client.api.health.$get();
assert.equal(health.status, 200);
assert.deepEqual(await health.json(), { ok: true });
const items = await client.api.items.$get();
assert.equal(items.status, 200);
assert.ok(Array.isArray((await items.json()).items));
const request = new Request("https://fixture.example/api/health", {
  headers: { "x-request-id": "fixture-request" },
});
const response = await app.fetch(request);
assert.equal(response.headers.get("x-request-id"), "fixture-request");
assert.equal((await app.request("/api/missing")).status, 404);
console.log(
  "Hono local fixture passed: typed client, routes, request IDs. Service Binding/deployed acceptance is deferred.",
);
