import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [root, templates, commit, kind, removedFile] = process.argv.slice(2);
assert.ok(path.isAbsolute(root ?? "") && path.isAbsolute(templates ?? ""));
assert.match(commit ?? "", /^[a-f0-9]{40}$/);
assert.ok(["previous", "candidate"].includes(kind));
assert.equal(execFileSync("git", ["-C", templates, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(), commit);
assert.equal(execFileSync("git", ["-C", templates, "status", "--porcelain", "--untracked-files=all"], { encoding: "utf8" }).trim(), "");
const source = await import(pathToFileURL(path.join(root, "scripts/templates/template-seed-query.ts")).href);
const api = await import(pathToFileURL(path.join(root, "src/server/templates/api.ts")).href);
const delivery = kind === "previous" ? await import(pathToFileURL(path.join(root, "packages/core/templates/release-manifest.mjs")).href) : api;
const rows = source.readTemplateSources(templates);
const prepared = api.validateTemplateRelease(rows, { kind: "git", repository: "Sangeok/harness-templates", commit });
const hash = value => createHash("sha256").update(value).digest("hex");
const observations = [];
for (const language of prepared.manifest.languages) {
  for (const plan of ["free", "pro", "max"]) {
    for (const client of ["claude", "codex"]) {
      const delivered = delivery.releaseDeliverable(rows.filter(row => row.lang === language), plan, client);
      const installation = delivery.installationFor({ releaseId: "shared-acceptance-fixed-release", rows, language, plan, client, contractHash: prepared.contractHash });
      observations.push({ language, plan, client, installation,
        bodyHashes: Object.fromEntries(Object.entries(delivered.templates).sort(([a], [b]) => a.localeCompare(b)).map(([file, body]) => [file, hash(body)])) });
    }
  }
}
const removed = JSON.parse(readFileSync(removedFile, "utf8"));
const obsolete = rows.filter(row => removed.some(file => row.body.includes("lib/" + file))
  || /(?:packages\/(?:core|github)\/|@harness\/(?:core|github)\/|["']lib["']\s*[,\]])/.test(row.body));
const skillFiles = [];
function visit(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) visit(file);
    else if (entry.name.endsWith(".md")) skillFiles.push(readFileSync(file, "utf8"));
  }
}
if (kind === "candidate") {
  visit(path.join(root, "plugin/skills")); visit(path.join(root, "plugin/codex/skills"));
}
assert.equal(obsolete.length, 0, "Private source has an obsolete or computed library reference requiring review");
assert.equal(skillFiles.filter(body => removed.some(file => body.includes("lib/" + file))).length, 0, "Candidate skill has an obsolete library reference");
console.log(JSON.stringify({ sourceHash: source.templateSourceHash(rows), rows: rows.length, languages: prepared.manifest.languages,
  contentHash: prepared.contentHash, contractHash: prepared.contractHash, releaseIdentity: prepared.releaseIdentity, observations }));
