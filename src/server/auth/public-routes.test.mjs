import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { PUBLIC_EXACT, PUBLIC_PREFIXES } from "./config.base";

const APP_DIR = "src/app";

function routeUrls(dir, urlPrefix, out) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "api") continue;
      const isGroup = name.startsWith("(") && name.endsWith(")");
      routeUrls(full, isGroup ? urlPrefix : `${urlPrefix}/${name}`, out);
    } else if (name === "page.tsx") {
      out.push({ url: urlPrefix === "" ? "/" : urlPrefix, inAppGroup: full.includes(`(app)`) });
    }
  }
  return out;
}

const isPublic = (url) => PUBLIC_EXACT.has(url) || PUBLIC_PREFIXES.some((p) => url.startsWith(p));

describe("public route list", () => {
  const routes = routeUrls(APP_DIR, "", []);

  it("finds the routes it is supposed to check", () => {
    assert.ok(routes.length >= 2, `expected several page.tsx under ${APP_DIR}, found ${routes.length}`);
  });

  it("lists every route that sits outside the authenticated (app) group", () => {
    for (const route of routes) {
      if (route.inAppGroup) continue;
      assert.ok(isPublic(route.url), `${route.url} is outside (app) but PUBLIC_EXACT/PUBLIC_PREFIXES do not open it — every visitor gets bounced to /login`);
    }
  });

  it("keeps the authenticated routes out of the public list", () => {
    for (const route of routes) {
      if (!route.inAppGroup) continue;
      assert.ok(!isPublic(route.url), `${route.url} is inside (app) but the public list opens it at the proxy`);
    }
  });

  it("has a real public page for every exact exception", () => {
    for (const url of PUBLIC_EXACT) {
      assert.ok(routes.some((route) => route.url === url && !route.inAppGroup), `${url} is a dead or protected exception in PUBLIC_EXACT`);
    }
  });
});
