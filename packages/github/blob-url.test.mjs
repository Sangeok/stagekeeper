import assert from "node:assert/strict";
import { it } from "node:test";
import { blobHref } from "./blob-url.mjs";

it("URL data round-trips reserved characters, raw percent names and slash branches without query/fragment", () => {
  const repo = { owner: "owner #?%", repo: "repo #?%", branch: "Feature/한글 #?%" };
  for (const ref of [null, "Commit/#?% 한글"]) for (const path of ["docs/plan#1.md", "docs/a?b%.md", "docs/%23 literal 한글.md", "/docs//A B.md/"]) {
    const href = blobHref(repo, path, ref);
    const url = new URL(href);
    assert.equal(url.search, ""); assert.equal(url.hash, "");
    assert.equal(url.pathname.split("/").map(decodeURIComponent).join("/"), `/${repo.owner}/${repo.repo}/blob/${ref ?? repo.branch}/${path}`);
    if (path.includes("%23")) assert.ok(href.includes("%2523"));
  }
});
