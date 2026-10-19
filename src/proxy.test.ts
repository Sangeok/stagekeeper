import "next/dist/server/node-environment";
import assert from "node:assert/strict";
import { it } from "node:test";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";

import { config } from "./proxy";

it("excludes the sitemap exactly and keeps page authentication and existing asset exclusions", () => {
  const excluded = ["/sitemap.xml", "/sitemap.xml?version=1", "/api/mcp", "/robots.txt", "/favicon.ico", "/icon", "/apple-icon", "/opengraph-image", "/_next/static/chunk.js", "/_next/image?url=icon"];
  const protectedPaths = ["/", "/login", "/projects", "/p/new", "/p/x", "/docs", "/docs/getting-started", "/docs/automation", "/docs/approval-gates", "/docs/security", "/sitemapXxml", "/sitemap.xml-private", "/sitemap.xml/extra"];
  for (const url of excluded) assert.equal(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url }), false, url);
  for (const url of protectedPaths) assert.equal(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url }), true, url);
});
