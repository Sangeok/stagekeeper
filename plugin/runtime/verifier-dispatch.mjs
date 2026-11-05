import { execFileSync } from "node:child_process";
import { verifierWorkflowFile } from "./report-artifacts.mjs";

export class RoleBriefingInputError extends Error {}

export function verifierTarget(root, board, key) {
  const report = board.reports?.filter(value => value.actor === board.agent && value.agentRunId).at(-1);
  if (!report || !/^[a-f0-9]{7,40}$/.test(report.commit ?? "") || !/^[a-f0-9]{7,40}$/.test(board.planCommit ?? "")) throw new Error("Independent verification requires the implementation report and approved plan");
  const git = (args, raw = false) => {
    const output = execFileSync("git", ["-C", root, "--no-optional-locks", "--no-replace-objects", "-c", "core.fsmonitor=false", ...args],
      { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"], timeout: 10000, maxBuffer: 1024 * 1024 });
    return raw ? output : output.trim();
  };
  const targetCommit = git(["rev-parse", "--verify", `${report.commit}^{commit}`]), planCommit = git(["rev-parse", "--verify", `${board.planCommit}^{commit}`]);
  if (!/^[a-f0-9]{40}$/.test(targetCommit) || !/^[a-f0-9]{40}$/.test(planCommit)) throw new Error("Independent verifier commit resolution failed");
  git(["merge-base", "--is-ancestor", targetCommit, "HEAD"]);
  const changed = git(["diff", "--no-ext-diff", "--no-textconv", "--name-only", "-z", targetCommit], true).split("\0").filter(Boolean);
  if (changed.some(name => !verifierWorkflowFile(name, key))) throw new Error("Product files changed since the implementation report");
  return { targetCommit, planCommit };
}
