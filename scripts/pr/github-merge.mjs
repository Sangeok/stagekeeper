import { OID, object, refuse, runCommand, remoteSnapshot, ancestor, monotonic } from "./git-workspace.mjs";

const integer = n => Number.isSafeInteger(n) && n > 0;
const endpoint = (ctx, suffix) => "repos/" + ctx.repository + suffix;
function decode(text) { try { return JSON.parse(text); } catch { refuse("github-response-invalid"); } }
function timeout(deadline, clock) {
  const remaining = Math.floor(deadline - clock());
  if (remaining < 1) refuse("merge-observation-deadline");
  return Math.min(20000, remaining);
}
export function github(ctx) {
  if (ctx.ports.github) return ctx.ports.github;
  return {
    async request(method, route, body, options = {}) {
      const args = ["api", "--hostname", "github.com", "--method", method, "--include", "-H", "Accept: application/vnd.github+json", "-H", "X-GitHub-Api-Version: 2022-11-28", route];
      if (body !== undefined) args.push("--input", "-");
      const result = await runCommand(ctx, "gh", args, { input: body === undefined ? undefined : JSON.stringify(body), allowed: [0, 1], diagnostics: true, ...options });
      const match = /^HTTP\/[\d.]+ (\d{3})[^\r\n]*\r?\n([\s\S]*?)\r?\n\r?\n([\s\S]*)$/.exec(result.output);
      if (!match) refuse("github-transport-unknown");
      const status = Number(match[1]), data = decode(match[3]);
      const retry = /^retry-after:\s*(\d+)\s*$/im.exec(match[2]);
      return { status, data, retryAfter: retry ? Number(retry[1]) : null };
    },
    readiness: (number, head) => inspectReadiness(ctx, number, head),
  };
}
export async function inspectReadiness(ctx, number, head) {
  const query = "query($owner:String!,$name:String!,$number:Int!,$cursor:String){repository(owner:$owner,name:$name){pullRequest(number:$number){number headRefOid mergeable mergeStateStatus reviewDecision commits(last:1){nodes{commit{oid statusCheckRollup{contexts(first:100,after:$cursor){pageInfo{hasNextPage endCursor}nodes{__typename ... on CheckRun{id isRequired(pullRequestNumber:$number) status conclusion} ... on StatusContext{id isRequired(pullRequestNumber:$number) state}}}}}}}}}}";
  const [owner, name] = ctx.repository.split("/"), required = [], cursors = new Set(), ids = new Set();
  let cursor = null, readiness = null;
  for (let page = 0; page < 100; page++) {
    const response = await github(ctx).request("POST", "graphql", { query, variables: { owner, name, number, cursor } });
    const pr = response.data?.data?.repository?.pullRequest;
    if (response.status !== 200 || response.data?.errors || pr?.number !== number || pr.headRefOid !== head
      || pr.commits?.nodes?.length !== 1 || pr.commits.nodes[0].commit?.oid !== head) refuse("readiness-unverified");
    const state = { mergeable: pr.mergeable, mergeStateStatus: pr.mergeStateStatus, reviewDecision: pr.reviewDecision };
    if (readiness && JSON.stringify(state) !== JSON.stringify(readiness)) refuse("readiness-changed");
    readiness = state;
    const connection = pr.commits.nodes[0].commit.statusCheckRollup?.contexts;
    if (!Array.isArray(connection?.nodes) || connection.nodes.length > 100 || typeof connection.pageInfo?.hasNextPage !== "boolean") refuse("required-checks-unverified");
    for (const check of connection.nodes) {
      if (!object(check) || typeof check.id !== "string" || ids.has(check.id) || typeof check.isRequired !== "boolean"
        || !["CheckRun", "StatusContext"].includes(check.__typename)) refuse("required-checks-unverified");
      ids.add(check.id);
      if (check.isRequired) required.push({ bucket: check.__typename === "CheckRun"
        ? check.status === "COMPLETED" && ["SUCCESS", "NEUTRAL", "SKIPPED"].includes(check.conclusion) ? "pass" : "fail"
        : check.state === "SUCCESS" ? "pass" : "fail" });
    }
    if (!connection.pageInfo.hasNextPage) return { ...readiness, required };
    cursor = connection.pageInfo.endCursor;
    if (typeof cursor !== "string" || !cursor || cursors.has(cursor)) refuse("required-checks-pagination");
    cursors.add(cursor);
  }
  refuse("required-checks-limit");
}
async function get(ctx, suffix, options) {
  const bounded = ctx.deadline ? { ...options, timeout: timeout(ctx.deadline.end, ctx.deadline.clock) } : options;
  const result = await github(ctx).request("GET", endpoint(ctx, suffix), undefined, bounded);
  if (result.status !== 200 || !object(result.data) && !Array.isArray(result.data)) refuse("github-observation-unavailable");
  return result.data;
}
export async function pull(ctx, record, number, options) {
  const repository = await get(ctx, "", options);
  if (!integer(repository.id) || repository.full_name?.toLowerCase() !== ctx.repository.toLowerCase() || repository.archived !== false || repository.disabled !== false) refuse("repository-unverified");
  const value = await get(ctx, "/pulls/" + number, options);
  const head = record.release?.head ?? record.expectedHead;
  if (!integer(number) || value.number !== number || typeof value.merged !== "boolean"
    || !["open", "closed"].includes(value.state) || value.state === "open" && value.merged
    || value.head?.repo?.id !== repository.id || value.base?.repo?.id !== repository.id
    || value.base?.ref !== "dev" || value.head?.ref !== record.branch || value.head?.sha !== head
    || record.pr && (record.pr.repositoryId !== repository.id || record.pr.number !== number || record.pr.head !== head)) refuse("pr-binding-mismatch");
  const state = value.merged ? "MERGED" : value.state === "open" ? "OPEN" : "CLOSED";
  if (state === "MERGED" && !OID.test(value.merge_commit_sha ?? "")) refuse("merge-proof-invalid");
  return { state, draft: value.draft, merge: value.merge_commit_sha, binding: { repositoryId: repository.id, number, head, branch: record.branch, base: "dev" } };
}
export async function findMergedPull(ctx, record, head) {
  const filter = "head=" + encodeURIComponent(ctx.repository.split("/")[0] + ":" + record.branch);
  const merged = new Set();
  for (let page = 1; ; page++) {
    const pulls = await get(ctx, "/pulls?state=all&base=dev&per_page=100&page=" + page + "&" + filter);
    if (!Array.isArray(pulls) || pulls.length > 100 || pulls.some(p => !object(p) || !integer(p.number) || !OID.test(p.head?.sha ?? ""))) refuse("pr-list-invalid");
    for (const p of pulls) {
      if (p.head.sha === head && p.head.ref === record.branch && p.base?.ref === "dev" && typeof p.merged_at === "string") merged.add(p.number);
    }
    if (pulls.length < 100) break;
    if (page === 10) refuse("pr-list-incomplete");
  }
  if (merged.size > 1) refuse("pr-ambiguous");
  return merged.size ? [...merged][0] : null;
}
export async function preflight(ctx, record, number) {
  const pr = await pull(ctx, record, number);
  if (pr.state !== "OPEN" || pr.draft !== false) refuse(pr.state === "CLOSED" ? "closed-unmerged" : "pr-not-ready");
  const head = pr.binding.head;
  const runs = [];
  let total;
  for (let page = 1; page <= 100; page++) {
    const response = await get(ctx, "/actions/workflows/check.yml/runs?head_sha=" + head + "&branch=" + encodeURIComponent(record.branch) + "&event=pull_request&per_page=100&page=" + page);
    if (!Number.isSafeInteger(response.total_count) || response.total_count < 1 || response.total_count > 10000
      || !Array.isArray(response.workflow_runs) || response.workflow_runs.length > 100 || total !== undefined && total !== response.total_count) refuse("check-metadata-invalid");
    total = response.total_count; runs.push(...response.workflow_runs);
    if (runs.length === total) break;
    if (runs.length > total || response.workflow_runs.length !== 100 || page === 100) refuse("check-pagination-incomplete");
  }
  if (new Set(runs.map(r => r.id)).size !== runs.length) refuse("check-metadata-invalid");
  for (const run of runs) {
    if (!integer(run.id) || !integer(run.run_number) || !integer(run.run_attempt) || run.head_sha !== head
      || run.head_branch !== record.branch || run.head_repository?.id !== pr.binding.repositoryId || run.event !== "pull_request"
      || !Array.isArray(run.pull_requests) || !run.pull_requests.some(p => p.number === number && p.head?.sha === head && p.head?.ref === record.branch && p.base?.ref === "dev")
      || ![".github/workflows/check.yml", ".github/workflows/check.yml@refs/heads/" + record.branch].includes(run.path)) refuse("check-metadata-invalid");
  }
  runs.sort((a, b) => b.run_number - a.run_number || b.run_attempt - a.run_attempt);
  const latest = runs[0];
  if (!latest || latest.status !== "completed" || latest.conclusion !== "success") refuse("check-not-green");
  const ready = await github(ctx).readiness(number, head);
  if (ready.mergeable !== "MERGEABLE" || ready.mergeStateStatus !== "CLEAN" || ![null, "", "APPROVED"].includes(ready.reviewDecision)
    || !Array.isArray(ready.required) || ready.required.some(c => !object(c) || c.bucket !== "pass")) refuse("pr-not-ready");
  return { pr, check: { id: latest.id, attempt: latest.run_attempt, head, conclusion: "success" } };
}
export async function requestMerge(ctx, record) {
  let result;
  try { result = await github(ctx).request("PUT", endpoint(ctx, "/pulls/" + record.pr.number + "/merge"), { sha: record.release.head, merge_method: "merge" }); }
  catch { return "unknown"; }
  if (result.status === 200 && result.data?.merged === true && OID.test(result.data.sha ?? "")) return "accepted";
  if ([403, 404, 405, 409, 422].includes(result.status) && object(result.data) && typeof result.data.message === "string") return "rejected";
  return "unknown";
}
export async function mergeProof(ctx, record, { fetch = true, deadline = Infinity, clock = monotonic } = {}) {
  const options = { timeout: timeout(deadline, clock) };
  const pr = await pull(ctx, record, record.pr.number, options);
  if (pr.state !== "MERGED") return null;
  const reference = await get(ctx, "/git/ref/heads/dev", { timeout: timeout(deadline, clock) });
  if (reference.ref !== "refs/heads/dev" || reference.object?.type !== "commit" || !OID.test(reference.object.sha ?? "")) refuse("dev-proof-invalid");
  const remote = await remoteSnapshot(ctx, record.branch, { fetch, timeout: timeout(deadline, clock) });
  if (remote.dev !== reference.object.sha || !await ancestor(ctx, pr.merge, remote.dev)) refuse("merge-not-preserved");
  return { head: record.release.head, merge: pr.merge, dev: remote.dev, pr: record.pr.number, at: new Date().toISOString(), check: record.merge?.check ?? null };
}
export async function observeMerge(ctx, record) {
  const clock = ctx.ports.clock ?? monotonic, sleep = ctx.ports.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const deadline = clock() + 120000;
  ctx.deadline = { end: deadline, clock };
  try { for (let count = 0; count < 30 && clock() < deadline; count++) {
    if (ctx.signal?.aborted || ctx.unsettled) return null;
    try { const proof = await mergeProof(ctx, record, { deadline, clock }); if (proof) return proof; }
    catch { return null; }
    if (deadline - clock() < 2000) return null;
    await sleep(2000);
  }
  return null;
  } finally { delete ctx.deadline; }
}
export async function noOpenDependencies(ctx, record) {
  for (const filter of ["head=" + encodeURIComponent(ctx.repository.split("/")[0] + ":" + record.branch), "base=" + encodeURIComponent(record.branch)]) {
    const pulls = await get(ctx, "/pulls?state=open&per_page=100&" + filter);
    if (!Array.isArray(pulls) || pulls.length) refuse("open-dependent-pr");
  }
}
export async function preservation(ctx, record, { fetch = true } = {}) {
  if (!record.release || !record.purpose) refuse("preservation-missing");
  const remote = await remoteSnapshot(ctx, record.branch, { fetch });
  if (remote.branch && remote.branch !== record.release.head) refuse("remote-branch-reused");
  if (record.purpose === "merged") {
    const proof = await mergeProof(ctx, record, { fetch });
    if (!proof || proof.merge !== record.merge?.merge) refuse("merge-not-preserved");
  } else if (!await ancestor(ctx, record.release.head, remote.dev)) refuse("head-not-in-dev");
  await noOpenDependencies(ctx, record);
  return remote;
}
