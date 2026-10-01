import assert from "node:assert/strict";
import { applySecurityHeaders } from "../apps/web/src/server/security";

const expected = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "x-frame-options": "DENY",
  "content-security-policy-report-only":
    "default-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
};
for (const environment of ["development", "preview", "production"] as const) {
  for (const contentType of ["text/html", "application/json"]) {
    const body =
      contentType === "text/html" ? "<!doctype html><title>Fixture</title>" : '{"ok":true}';
    const response = applySecurityHeaders(
      new Response(body, { headers: { "content-type": contentType } }),
      environment,
      "fixture-id",
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), contentType);
    assert.equal(response.headers.get("x-request-id"), "fixture-id");
    for (const [name, value] of Object.entries(expected))
      assert.equal(response.headers.get(name), value);
    assert.equal(response.headers.get("strict-transport-security"), null);
    assert.equal(
      response.headers.get("x-robots-tag"),
      environment === "preview" ? "noindex, nofollow" : null,
    );
    assert.equal(await response.text(), body, "Applying policy must preserve the response body");
  }
}
console.log(
  "Response policy fixture passed for HTML/API development, preview, and production responses. Deployed header acceptance is separate.",
);
