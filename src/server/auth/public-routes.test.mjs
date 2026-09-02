// "어디가 공개 경로인가"는 두 곳에 적혀 있다: 데이터(config.base.ts의 PUBLIC_EXACT·PUBLIC_PREFIXES,
// proxy가 읽는다)와 디렉터리 구조(src/app/(app) 밖에 있는 라우트 파일). 라우트 그룹은 URL에
// 나타나지 않으므로 proxy가 구조를 읽을 길이 없다 — 코로케이션이 불가능하다.
// 그래서 합치는 대신 어긋남을 여기서 잡는다. 공개 페이지를 추가하고 목록을 잊으면 모든 방문자가
// /login으로 튕기고, 반대로 목록에만 있고 페이지가 없으면 죽은 예외가 남는다.
import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { PUBLIC_EXACT, PUBLIC_PREFIXES } from "./config.base.ts";

const APP_DIR = "src/app";

// src/app 아래 page.tsx가 만드는 URL 경로들. 라우트 그룹 "(app)"은 URL에 나타나지 않는다.
function routeUrls(dir, urlPrefix, out) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "api") continue; // proxy matcher가 /api/*를 제외한다 — 자체 토큰 검사로 지킨다
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
});
