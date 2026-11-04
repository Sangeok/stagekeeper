import { lstatSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { execFileSync } from "node:child_process";
import { manifestHash } from "../../packages/core/templates/release-manifest.mjs";
import { bootstrapTemplateReleases, snapshotTemplateCutover, readTemplateDeployment, templateCutoverEvidenceSchema } from "../../src/server/templates/api";
import { readTemplateTarget, withTemplateTarget, templateCommandArguments, templateCommandAudit, TEMPLATE_TARGET_OPTIONS } from "./template-target";

function privatePath(filename: string, exists: boolean): string {
  if (!filename || !isAbsolute(filename)) throw new Error("An absolute private snapshot/evidence path is required");
  const file = resolve(filename), root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
  const actual = exists ? realpathSync(file) : resolve(realpathSync(dirname(file)), basename(file));
  if (file !== actual) throw new Error("Private cutover paths cannot traverse aliases");
  const rel = relative(root, actual);
  if (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(".." + sep)) throw new Error("Private cutover files must be outside the checkout");
  if (exists) {
    const stat = lstatSync(file);
    if (realpathSync(file) !== file || !stat.isFile() || stat.nlink !== 1 || (stat.mode & 0o077) !== 0) throw new Error("Private cutover files must be owned regular files with mode 0600");
  }
  return file;
}

async function main() {
  if (process.argv.slice(2).join(" ") === "--help") {
    console.log("Usage: bootstrap-template-releases --profile-file <private JSON> --environment <name> --snapshot <new private file> | --result <request-id> | --snapshot-file <private file> --evidence-file <approved private JSON> --request-id <id> --actor <actor> --code-sha <sha> --workflow-run <run>");
    return;
  }
  const options = templateCommandArguments(process.argv.slice(2), [...TEMPLATE_TARGET_OPTIONS, "--snapshot", "--snapshot-file", "--evidence-file", "--result"]);
  const target = readTemplateTarget(options["--profile-file"], options["--environment"]);
  if (options["--snapshot"]) {
    if (options["--result"] || options["--evidence-file"] || options["--snapshot-file"]) throw new Error("Conflicting bootstrap operations");
    const file = privatePath(options["--snapshot"], false);
    const snapshot = await withTemplateTarget(target, snapshotTemplateCutover);
    writeFileSync(file, JSON.stringify({ ...snapshot, targetIdentityHash: target.identityHash }) + "\n", { mode: 0o600, flag: "wx" });
    privatePath(file, true);
    console.log(JSON.stringify({ snapshotHash: snapshot.hash, targetIdentityHash: target.identityHash }));
    return;
  }
  if (options["--result"]) {
    if (options["--evidence-file"] || options["--snapshot-file"]) throw new Error("Conflicting bootstrap operations");
    console.log(JSON.stringify(await withTemplateTarget(target, db => readTemplateDeployment(db, "bootstrap", options["--result"]))));
    return;
  }
  const audit = templateCommandAudit(target, options);
  const snapshot = JSON.parse(readFileSync(privatePath(options["--snapshot-file"], true), "utf8"));
  const evidence = templateCutoverEvidenceSchema.parse(JSON.parse(readFileSync(privatePath(options["--evidence-file"], true), "utf8")));
  if (snapshot.schemaVersion !== 1 || snapshot.hash !== manifestHash(snapshot.data) || snapshot.hash !== evidence.snapshotHash
    || snapshot.targetIdentityHash !== target.identityHash || evidence.targetIdentityHash !== target.identityHash) throw new Error("Private snapshot and approved cutover evidence disagree");
  const result = await withTemplateTarget(target, db => bootstrapTemplateReleases(db, { requestId: options["--request-id"], audit, evidence }));
  if (!result.ok) throw new Error("Template bootstrap was refused");
  console.log(JSON.stringify(result.item));
}

main().catch(() => { console.error("Template bootstrap failed. Preserve the private snapshot, inspect maintenance evidence and query the same request ID; private details are omitted."); process.exitCode = 1; });
