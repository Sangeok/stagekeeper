import { readTemplateSources } from "./template-seed-query";
import { validateTemplateRelease } from "../../src/server/templates/api";
import { templateCommandArguments } from "./template-target";

try {
  const options = templateCommandArguments(process.argv.slice(2), ["--dir", "--commit"]);
  const prepared = validateTemplateRelease(readTemplateSources(options["--dir"]), { kind: "git", repository: "Sangeok/harness-templates", commit: options["--commit"] });
  console.log(JSON.stringify({ sourceCommit: options["--commit"], releaseIdentity: prepared.releaseIdentity, contentHash: prepared.contentHash, contractHash: prepared.contractHash, entryCount: prepared.rows.length }));
} catch { console.error("Template release preflight failed; private source details withheld."); process.exitCode = 1; }
