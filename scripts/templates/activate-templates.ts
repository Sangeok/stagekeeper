import { activateTemplateRelease, readTemplateChannel, readTemplateDeployment } from "../../src/server/templates/api";
import { readTemplateTarget, withTemplateTarget, templateCommandArguments, templateCommandAudit, TEMPLATE_TARGET_OPTIONS } from "./template-target";

async function main(): Promise<void> {
  if (process.argv.slice(2).join(" ") === "--help") {
    console.log("Usage: activate-templates --profile-file <private JSON> --environment <name> --request-id <id> --actor <actor> --code-sha <sha> --workflow-run <run> --release <id> --expected-revision <integer> | --result <request-id> | --status true");
    return;
  }
  const options = templateCommandArguments(process.argv.slice(2), [...TEMPLATE_TARGET_OPTIONS, "--release", "--expected-revision", "--result", "--status"]);
  const target = readTemplateTarget(options["--profile-file"], options["--environment"]);
  if (options["--status"]) {
    if (options["--status"] !== "true" || options["--result"] || options["--release"]) throw new Error("Conflicting template operations");
    console.log(JSON.stringify(await withTemplateTarget(target, readTemplateChannel)));
    return;
  }
  if (options["--result"]) {
    console.log(JSON.stringify(await withTemplateTarget(target, db => readTemplateDeployment(db, "activate", options["--result"]))));
    return;
  }
  if (!/^\d+$/.test(options["--expected-revision"] ?? "")) throw new Error("Expected revision is required");
  const audit = templateCommandAudit(target, options);
  const result = await withTemplateTarget(target, db => activateTemplateRelease(db, {
    requestId: options["--request-id"], releaseId: options["--release"], expectedRevision: Number(options["--expected-revision"]), audit,
  }));
  if (!result.ok) throw new Error("Template activation was refused");
  console.log(JSON.stringify(result.item));
}

main().catch(() => { console.error("Template activation failed. Query the same request ID and inspect the current channel before another activation; private details are omitted."); process.exitCode = 1; });
