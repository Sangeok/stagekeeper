import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";

// 슬러그·저장소 이름 규칙은 두 트리에 한 벌씩 있다 — src/server는 FSD를, FSD의 model은 src/server를
// import할 수 없다(verify-fsd-boundaries.mjs의 server/no-fsd-import·fsd/server-import-boundary).
// 중복은 두고 어긋남만 시끄럽게 만든다: 두 파일의 **소스 텍스트**에서 상수의 초기값을 읽어 비교한다.
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const SERVER = read("./project-slug-rule.ts");
const FSD_SLUG = read("../fsd/features/create-project/model/project-slug.ts");
const FSD_REPO = read("../fsd/features/create-project/model/repo-url.ts");

function initializer(source: string, name: string): string {
  const match = source.match(new RegExp(`^export const ${name} = (.+);\\r?$`, "m"));
  assert.ok(match, `export const ${name} not found`);
  return match[1];
}

it("the server slug rule and the web form's slug rule are the same text", () => {
  for (const name of ["SLUG_MAX", "SLUG_RE", "RESERVED_SLUGS"]) {
    assert.equal(initializer(SERVER, name), initializer(FSD_SLUG, name), `${name} drifted between src/server/project-slug-rule.ts and create-project/model/project-slug.ts`);
  }
});

it("the server repository segment rule and the web form's are the same text", () => {
  assert.equal(initializer(SERVER, "REPO_SEGMENT"), initializer(FSD_REPO, "SEGMENT"), "REPO_SEGMENT drifted from create-project/model/repo-url.ts SEGMENT");
});
