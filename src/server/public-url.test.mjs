import assert from "node:assert/strict";
import { it } from "node:test";

it("falls back to the local URL and reports a missing HARNESS_PUBLIC_URL once, on first call, in production", async (t) => {
  const saved = { url: process.env.HARNESS_PUBLIC_URL, env: process.env.NODE_ENV };
  t.after(() => {
    if (saved.url === undefined) delete process.env.HARNESS_PUBLIC_URL; else process.env.HARNESS_PUBLIC_URL = saved.url;
    process.env.NODE_ENV = saved.env;
  });
  delete process.env.HARNESS_PUBLIC_URL;
  process.env.NODE_ENV = "production";
  const errors = t.mock.method(console, "error", () => {});

  const { mcpUrl, ownerMcpUrl, siteUrl } = await import("./public-url");
  assert.equal(errors.mock.callCount(), 0, "no log at module load");
  assert.equal(siteUrl().href, "http://localhost:3000/");
  assert.equal(errors.mock.callCount(), 0, "no log for the metadata base");
  assert.equal(mcpUrl(), "http://localhost:3000/api/mcp");
  assert.equal(ownerMcpUrl(), "http://localhost:3000/api/mcp/owner");
  assert.equal(errors.mock.callCount(), 1);
  assert.match(String(errors.mock.calls[0].arguments[0]), /HARNESS_PUBLIC_URL is not set/);
});
