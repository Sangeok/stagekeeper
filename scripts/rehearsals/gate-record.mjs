import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { main } from "../../.github/actions/gate-record/record.mjs";

export { USAGE, findingIssue, gateRow, openFinding, recordComment } from "../../.github/actions/gate-record/record.mjs";
export { main };

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
