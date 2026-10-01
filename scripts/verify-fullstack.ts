import assert from "node:assert/strict";
import { hc } from "hono/client";
import { app, type AppType } from "../apps/server/src/index";
import webWorker from "../apps/web/src/server/entry";
import { getServerClient } from "../apps/web/src/lib/server-client";

// 1. In-memory Hono contract evidence
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

// 2. Web Worker /api/* forwarding with in-memory fallback
const mockCtx = {
  waitUntil: () => {},
  passThroughOnException: () => {},
};

const webReqNoBinding = new Request("https://fixture.example/api/items", {
  headers: { "x-request-id": "web-req-1" },
});
const webResNoBinding = await webWorker.fetch(
  webReqNoBinding,
  { FLARE_ENVIRONMENT: "development" } as any,
  mockCtx as any,
);
assert.equal(webResNoBinding.status, 200);
assert.equal(webResNoBinding.headers.get("x-request-id"), "web-req-1");
assert.equal(webResNoBinding.headers.get("x-content-type-options"), "nosniff");
const webDataNoBinding = (await webResNoBinding.json()) as {
  items: Array<{ id: string; name: string }>;
};
assert.ok(Array.isArray(webDataNoBinding.items));
assert.equal(webDataNoBinding.items.length, 2);

// 3. Web Worker /api/* forwarding with simulated Cloudflare Service Binding
let serviceBindingHit = false;
const mockServerBinding = {
  fetch: async (req: Request) => {
    serviceBindingHit = true;
    assert.equal(req.headers.get("x-request-id"), "web-req-sb");
    return new Response(JSON.stringify({ fromServiceBinding: true }), {
      headers: { "content-type": "application/json" },
    });
  },
  connect: () => {
    throw new Error("connect not implemented");
  },
};

const webReqBinding = new Request("https://fixture.example/api/custom-route", {
  headers: { "x-request-id": "web-req-sb" },
});
const webResBinding = await webWorker.fetch(
  webReqBinding,
  {
    FLARE_ENVIRONMENT: "production",
    SERVER: mockServerBinding,
  } as any,
  mockCtx as any,
);
assert.equal(webResBinding.status, 200);
assert.equal(serviceBindingHit, true);
assert.equal(webResBinding.headers.get("x-request-id"), "web-req-sb");
assert.equal(webResBinding.headers.get("x-content-type-options"), "nosniff");
const sbData = (await webResBinding.json()) as { fromServiceBinding: boolean };
assert.equal(sbData.fromServiceBinding, true);

// 4. getServerClient RPC helper with in-memory fallback
const rpcClientFallback = getServerClient();
const rpcHealthFallback = await rpcClientFallback.api.health.$get();
assert.equal(rpcHealthFallback.status, 200);
assert.deepEqual(await rpcHealthFallback.json(), { ok: true });
const rpcItemsFallback = await rpcClientFallback.api.items.$get();
assert.equal(rpcItemsFallback.status, 200);
assert.equal(((await rpcItemsFallback.json()) as any).items.length, 2);

// 5. getServerClient RPC helper with simulated Cloudflare Service Binding
let rpcBindingHit = false;
const mockRpcBinding = {
  fetch: async (input: string | Request) => {
    rpcBindingHit = true;
    const url = typeof input === "string" ? input : input.url;
    assert.equal(url, "https://server.internal/api/health");
    return new Response(JSON.stringify({ ok: true, rpcServiceBinding: true }), {
      headers: { "content-type": "application/json" },
    });
  },
  connect: () => {
    throw new Error("connect not implemented");
  },
};
const rpcClientBinding = getServerClient({ SERVER: mockRpcBinding as any });
const rpcRes = await rpcClientBinding.api.health.$get();
assert.equal(rpcRes.status, 200);
assert.equal(rpcBindingHit, true);
assert.deepEqual(await rpcRes.json(), { ok: true, rpcServiceBinding: true });

console.log(
  "Fullstack verification passed: Hono RPC, Service Binding forwarder, request ID propagation, security headers, and getServerClient RPC client.",
);
