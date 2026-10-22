import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import path from "node:path";
import { safeTarget } from "./file-ownership.mjs";

const digest = text => createHash("sha256").update(text.replaceAll("\r\n", "\n")).digest("hex");
const git = (root, ...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", windowsHide: true, maxBuffer: 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });

function artifactHash(root, name) {
  const target = safeTarget(root, name), stat = lstatSync(target);
  if (!stat.isFile() || stat.nlink !== 1 || stat.size > 1024 * 1024) throw new Error("Invalid handoff artifact");
  return digest(readFileSync(target, "utf8"));
}

export function confirmCommitHandoff(root, key, next, suppliedCommit) {
  const resume = next.resume;
  if (next.action !== "wait" || next.on !== "handoff" || !/^[A-Za-z0-9_-]+$/.test(key ?? "") || key !== next.key
    || !/^[0-9a-f]{7,40}$/.test(suppliedCommit ?? "") || resume?.key !== key || !resume.agentRunId
    || !/^[a-z][a-z0-9-]*$/.test(resume.agent ?? "") || typeof next.note !== "string") throw new Error("Current handoff binding required");
  const target = safeTarget(root, next.note.trim());
  const name = path.relative(root, target).replaceAll("\\", "/");
  if (![ `docs/plans/${key}.md`, `docs/agents/${resume.agent}/${key}.md` ].includes(name)) throw new Error("Handoff artifact path differs from current role/item");
  const commit = git(root, "rev-parse", "--verify", `${suppliedCommit}^{commit}`).trim();
  git(root, "merge-base", "--is-ancestor", commit, "HEAD");
  const contentHash = digest(git(root, "show", `${commit}:${name}`));
  if (contentHash !== artifactHash(root, name)) throw new Error("Prepared handoff file differs from confirmed commit");
  return { path: name, absolutePath: target, commit, contentHash, agent: resume.agent, key, agentRunId: resume.agentRunId, entry: resume.entry ?? null };
}

export function assertCommitHandoff(root, dispatch) {
  const handoff = dispatch.commitHandoff;
  if (!handoff) return;
  if (handoff.agent !== dispatch.agent || handoff.key !== dispatch.key || handoff.agentRunId !== dispatch.agentRunId
    || !isDeepStrictEqual(handoff.entry, dispatch.entry ?? null)) throw new Error("Handoff execution binding changed");
  const current = confirmCommitHandoff(root, dispatch.key, {
    action: "wait", on: "handoff", key: dispatch.key, note: handoff.path,
    resume: { agent: dispatch.agent, key: dispatch.key, agentRunId: dispatch.agentRunId, entry: dispatch.entry },
  }, handoff.commit);
  if (!isDeepStrictEqual(current, handoff)) throw new Error("Confirmed handoff changed");
}

export function assertHandoffSubmission(root, dispatch, name, args, stepResponse) {
  const handoff = dispatch.commitHandoff;
  if (!handoff || !["plan_submit", "report_submit"].includes(name)) return;
  const expected = handoff.path.startsWith("docs/plans/") ? "plan_submit" : "report_submit";
  if (name !== expected || args.path !== handoff.path || args.commit !== handoff.commit
    || stepResponse?.receipt?.runId !== handoff.agentRunId) throw new Error("Submission differs from confirmed handoff");
  assertCommitHandoff(root, dispatch);
}
