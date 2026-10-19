import assert from "node:assert/strict";
import { it } from "node:test";

import { DOCS_PAGES } from "@/fsd/pages/docs";

import sitemap from "./sitemap";

it("includes exactly the landing and five document URLs without invented update fields", (t) => {
  const previous = process.env.HARNESS_PUBLIC_URL;
  t.after(() => { if (previous === undefined) delete process.env.HARNESS_PUBLIC_URL; else process.env.HARNESS_PUBLIC_URL = previous; });
  process.env.HARNESS_PUBLIC_URL = "https://docs.example.test/";
  assert.deepEqual(sitemap(), ["/", ...DOCS_PAGES.map((page) => page.path)].map((pathname) => ({ url: new URL(pathname, "https://docs.example.test/").href })));
});
