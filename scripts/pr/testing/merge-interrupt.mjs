import fs from "node:fs";
import { runPrCommand } from "../index.mjs";

const input = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const repository = { id: 42, full_name: "fixture/stagekeeper", archived: false, disabled: false };
const pr = { number: 1, state: "open", merged: false, draft: false, head: { sha: input.expectedHead, ref: input.branch, repo: repository }, base: { ref: "dev", repo: repository } };
const ports = {
  sourceRevision: async () => input.expectedHead,
  inspectUsage: async () => ({ status: "unknown", capability: { status: "unqualified" }, observationPerformed: false, observation: { coverageComplete: false }, observer: { state: "not-started" } }),
  github: {
    readiness: async () => ({ mergeable: "MERGEABLE", mergeStateStatus: "CLEAN", reviewDecision: "", required: [] }),
    async request(method, route) {
      if (method === "PUT") {
        process.stdout.write("intent-ready\n");
        setInterval(() => {}, 1000);
        return new Promise(() => {});
      }
      const suffix = route.replace("repos/fixture/stagekeeper", "");
      if (suffix === "") return { status: 200, data: repository };
      if (suffix === "/pulls/1") return { status: 200, data: pr };
      if (suffix.startsWith("/actions/")) return { status: 200, data: { total_count: 1, workflow_runs: [{ id: 1, run_number: 1, run_attempt: 1,
        head_sha: input.expectedHead, head_branch: input.branch, head_repository: repository, event: "pull_request", path: ".github/workflows/check.yml",
        status: "completed", conclusion: "success", pull_requests: [{ number: 1, head: pr.head, base: pr.base }] }] } };
      throw new Error("Unexpected fixture request");
    },
  },
};
const options = { ...input }; delete options.branch;
const result = await runPrCommand(options, ports);
process.stdout.write(JSON.stringify(result) + "\n"); process.exitCode = result.exitCode;
