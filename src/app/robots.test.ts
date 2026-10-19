import assert from "node:assert/strict";
import { it } from "node:test";

import robots from "./robots";

it("keeps the API crawl rule and adds the canonical sitemap URL", (t) => {
  const previous = process.env.HARNESS_PUBLIC_URL;
  t.after(() => { if (previous === undefined) delete process.env.HARNESS_PUBLIC_URL; else process.env.HARNESS_PUBLIC_URL = previous; });
  process.env.HARNESS_PUBLIC_URL = "https://docs.example.test";
  assert.deepEqual(robots(), {
    rules: { userAgent: "*", disallow: "/api/" },
    sitemap: "https://docs.example.test/sitemap.xml",
  });
});
