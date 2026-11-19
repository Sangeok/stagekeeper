import fs from "node:fs";
import { runPrCommand } from "../index.mjs";

const { options, repository, pr, worktree, scope } = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const result = await runPrCommand(options, {
  sourceRevision: async () => pr.head.sha,
  releaseScope: async () => scope,
  inspectUsage: async () => ({ status: "clear", capability: { status: "qualified" }, observationPerformed: true,
    observation: { coverageComplete: true }, observer: { state: "settled" } }),
  github: {
    async request(method, route) {
      if (method !== "GET") throw new Error("unexpected mutation");
      if (!fs.existsSync(worktree)) {
        process.stdout.write("removed-before-branch\n");
        process.stdin.resume();
        await new Promise(() => {});
      }
      if (route.endsWith("/pulls/1")) return { status: 200, data: pr };
      if (route.includes("/pulls?")) return { status: 200, data: [] };
      if (route.endsWith("/git/ref/heads/dev")) return { status: 200, data: { ref: "refs/heads/dev", object: { type: "commit", sha: pr.merge_commit_sha } } };
      return { status: 200, data: repository };
    },
  },
});
process.stdout.write(JSON.stringify(result) + "\n");
process.exitCode = result.exitCode;
