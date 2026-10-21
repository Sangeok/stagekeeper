import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import { SEGMENT } from "@harness/core/repo-url.mjs";
import { REPO_SEGMENT } from "./slug-rule";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const SERVER = read("./slug-rule.ts");
const FSD_SLUG = read("../../fsd/features/create-project/model/project-slug.ts");

function initializer(source: string, name: string): string {
  const match = source.match(new RegExp(`^export const ${name} = (.+);\\r?$`, "m"));
  assert.ok(match, `export const ${name} not found`);
  return match[1];
}

it("the server slug rule and the web form's slug rule are the same text", () => {
  for (const name of ["SLUG_MAX", "SLUG_RE", "RESERVED_SLUGS"]) {
    assert.equal(initializer(SERVER, name), initializer(FSD_SLUG, name), `${name} drifted between src/server/projects/slug-rule.ts and create-project/model/project-slug.ts`);
  }
});

it("the server repository segment rule matches the shared core policy", () => {
  assert.equal(REPO_SEGMENT.source, SEGMENT.source);
  assert.equal(REPO_SEGMENT.flags, SEGMENT.flags);
});
