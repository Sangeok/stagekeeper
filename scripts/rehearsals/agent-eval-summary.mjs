import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { main } from "./agent-eval/agent-eval-summary.mjs";

export { GATE_CASES, USAGE, controlDetected, evalLines, evalRecord, summarizeEval } from "./agent-eval/agent-eval-summary.mjs";
export { main };

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
