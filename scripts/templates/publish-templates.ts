import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { publishTemplateRelease, readTemplateDeployment } from "../../src/server/templates/api";
import { readTemplateSources } from "./template-seed-query";
import { readTemplateTarget, withTemplateTarget, templateCommandArguments, templateCommandAudit, TEMPLATE_TARGET_OPTIONS } from "./template-target";

async function main(): Promise<void> {
  if (process.argv.slice(2).join(" ") === "--help") {
    console.log("Usage: publish-templates --profile-file <private JSON> --environment <name> --request-id <id> --actor <actor> --code-sha <sha> --workflow-run <run> --dir <clean private checkout> --commit <sha> | --result <request-id>");
    return;
  }
  const options = templateCommandArguments(process.argv.slice(2), [...TEMPLATE_TARGET_OPTIONS, "--dir", "--commit", "--result"]);
  const target = readTemplateTarget(options["--profile-file"], options["--environment"]);
  if (options["--result"]) {
    console.log(JSON.stringify(await withTemplateTarget(target, db => readTemplateDeployment(db, "import", options["--result"]))));
    return;
  }
  const audit = templateCommandAudit(target, options);
  const root = realpathSync(options["--dir"]);
  const git = (...args: string[]) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
  if (realpathSync(git("rev-parse", "--show-toplevel")) !== root || !/^[a-f0-9]{40}$/.test(options["--commit"]) || git("rev-parse", "HEAD") !== options["--commit"]
    || git("status", "--porcelain", "--untracked-files=all") || !/^(?:https:\/\/github\.com\/|git@github\.com:)Sangeok\/harness-templates(?:\.git)?$/i.test(git("remote", "get-url", "origin"))) throw new Error("Clean approved private source checkout required");
  const rows = readTemplateSources(root);
  for (const row of rows) {
    const file = `${row.lang}/${row.path}`;
    const bytes = readFileSync(resolve(root, file));
    const blob = execFileSync("git", ["-C", root, "show", `HEAD:${file}`]);
    const decode = (value: Uint8Array) => new TextDecoder("utf-8", { fatal: true }).decode(value).replaceAll("\r\n", "\n");
    if (decode(bytes) !== decode(blob) || decode(bytes) !== row.body) throw new Error("Template file differs from its pinned Git blob");
  }
  const result = await withTemplateTarget(target, db => publishTemplateRelease(db, {
    requestId: options["--request-id"], source: { kind: "git", repository: "Sangeok/harness-templates", commit: options["--commit"] }, rows, audit,
  }));
  if (!result.ok) throw new Error("Template import was refused");
  console.log(JSON.stringify(result.item));
}

main().catch(() => { console.error("Template import failed. Inspect the approved source/target and query the same request ID; private details are omitted."); process.exitCode = 1; });
