import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { it } from "node:test";

import { DOCS_PATHS } from "@/fsd/shared/routes/docs";

import { DOCS_PAGES } from "./docs-pages";
import { docsMetadata } from "./docs-metadata";

function pageFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name);
    return entry.isDirectory() ? pageFiles(file) : entry.name === "page.tsx" ? [file] : [];
  });
}

it("keeps the registry, shared paths and real static pages in the same order and set", () => {
  assert.deepEqual(DOCS_PAGES.map((page) => page.id), ["overview", "getting-started", "automation", "approval-gates", "security"]);
  assert.deepEqual(DOCS_PAGES.map((page) => page.path), Object.values(DOCS_PATHS));
  const actual = pageFiles("src/app/docs").map((file) => {
    const subpath = relative("src/app/docs", file).replaceAll("\\", "/").replace(/(^|\/)page\.tsx$/, "");
    return subpath ? `/docs/${subpath}` : "/docs";
  });
  assert.deepEqual(actual.sort(), DOCS_PAGES.map((page) => page.path).sort());
  assert.equal(new Set(DOCS_PAGES.map((page) => page.title)).size, 5);
  assert.equal(new Set(DOCS_PAGES.map((page) => page.description)).size, 5);
});

it("sets page-specific metadata without replacing inherited sharing metadata", () => {
  for (const page of DOCS_PAGES) {
    assert.ok(page.description.length > 0 && page.description.length <= 155);
    assert.deepEqual(docsMetadata(page.id), {
      title: page.id === "overview" ? { absolute: page.title } : page.title,
      description: page.description,
      alternates: { canonical: page.path },
    });
  }
});
