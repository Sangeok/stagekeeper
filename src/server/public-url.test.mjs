import assert from "node:assert/strict";
import { it } from "node:test";

// 프로덕션에서 HARNESS_PUBLIC_URL이 없으면 fallback을 돌려주되 첫 호출에 한 번 오류를 남긴다(모듈 로드 때가 아니라).
it("falls back to the local URL and reports a missing HARNESS_PUBLIC_URL once, on first call, in production", async (t) => {
  const saved = { url: process.env.HARNESS_PUBLIC_URL, env: process.env.NODE_ENV };
  t.after(() => {
    if (saved.url === undefined) delete process.env.HARNESS_PUBLIC_URL; else process.env.HARNESS_PUBLIC_URL = saved.url;
    process.env.NODE_ENV = saved.env;
  });
  delete process.env.HARNESS_PUBLIC_URL;
  process.env.NODE_ENV = "production";
  const errors = t.mock.method(console, "error", () => {});

  const { mcpUrl, ownerMcpUrl } = await import("./public-url.ts");
  assert.equal(errors.mock.callCount(), 0, "no log at module load");
  assert.equal(mcpUrl(), "http://localhost:3000/api/mcp");
  assert.equal(ownerMcpUrl(), "http://localhost:3000/api/mcp/owner");
  assert.equal(errors.mock.callCount(), 1);
  assert.match(String(errors.mock.calls[0].arguments[0]), /HARNESS_PUBLIC_URL is not set/);
});
