import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  closeSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync,
  readlinkSync, realpathSync, renameSync, rmdirSync, unlinkSync, writeFileSync,
} from "node:fs";
import { hostname } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cleanupTaskBranches, inspectMergedTaskBranch, parseWorktreeList, validateBranch } from "./cleanup-task-branches.mjs";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const SHA = /^[a-f0-9]{40}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const CODE = /^[a-z][a-z0-9-]{0,79}$/;
const STATES = ["creating", "active", "closing", "removed"];
const OPERATIONS = ["create", "status", "finish", "retry", "resume", "recover-guard"];
const DIRECTORY_CACHE = ["node_modules", ".next", "src/generated", "coverage"];
const FILE_CACHE = ["tsconfig.tsbuildinfo", "next-env.d.ts"];
const NAMESPACE = "stagekeeper-task-worktrees";
const MARKER = "stagekeeper-task.json";
const MAX_JSON = 1024 * 1024;
const MAX_OUTPUT = 16 * 1024 * 1024;
const decoder = new TextDecoder("utf-8", { fatal: true });
const isUuid = value => typeof value === "string" && UUID.test(value);
const isSha = value => typeof value === "string" && SHA.test(value);
const isDigest = value => typeof value === "string" && DIGEST.test(value);
const isCode = value => typeof value === "string" && CODE.test(value);
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const integer = value => Number.isSafeInteger(value) && value > 0;
const date = value => typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const now = () => new Date().toISOString();
const samePath = (left, right) => path.relative(left, right) === "";
const inside = (parent, child) => {
  const relative = path.relative(parent, child);
  return relative === "" || relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative);
};

class WorktreeFailure extends Error {
  constructor(code, exitCode = 2, shared = false) { super(code); this.code = code; this.exitCode = exitCode; this.shared = shared; }
}
const refuse = (code, exitCode = 2, shared = false) => { throw new WorktreeFailure(code, exitCode, shared); };
const failure = error => error instanceof WorktreeFailure ? error : new WorktreeFailure("inspection-failed", 1);

function stat(file) {
  try { return lstatSync(file, { bigint: true }); }
  catch (error) { if (error.code === "ENOENT" || error.code === "ENOTDIR") return null; throw error; }
}

function noLinks(file, absent = false) {
  const full = path.resolve(file);
  let current = path.parse(full).root;
  for (const part of full.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const info = stat(current);
    if (!info) { if (absent) continue; refuse("path-missing", 1); }
    else if (info.isSymbolicLink()) refuse("linked-path");
    else if (!samePath(current, full) && !info.isDirectory()) refuse("invalid-path", 1);
  }
  return full;
}

function native(file) {
  noLinks(file);
  return realpathSync.native(file);
}

function readJson(file) {
  noLinks(file);
  const info = stat(file);
  if (!info?.isFile() || info.nlink !== 1n || info.size > BigInt(MAX_JSON)) refuse("corrupt-state", 1, true);
  try { return JSON.parse(readFileSync(file, "utf8")); }
  catch { refuse("corrupt-state", 1, true); }
}

function atomicJson(file, value, initial = false) {
  noLinks(path.dirname(file));
  const prior = stat(file);
  if (initial && prior) refuse("state-collision", 1, true);
  if (prior && (!prior.isFile() || prior.isSymbolicLink() || prior.nlink !== 1n)) refuse("corrupt-state", 1, true);
  const bytes = JSON.stringify(value) + "\n";
  if (Buffer.byteLength(bytes) > MAX_JSON) refuse("state-too-large", 1, true);
  const temporary = path.join(path.dirname(file), `.tmp-${randomUUID()}`);
  let fd;
  try {
    fd = openSync(temporary, "wx", 0o600);
    writeFileSync(fd, bytes); fsyncSync(fd); closeSync(fd); fd = undefined;
    noLinks(path.dirname(file));
    if (initial && stat(file)) refuse("state-collision", 1, true);
    renameSync(temporary, file);
  } catch (error) {
    if (error instanceof WorktreeFailure) throw error;
    refuse("state-write-failed", 1, true);
  } finally {
    if (fd !== undefined) closeSync(fd);
    if (stat(temporary)) unlinkSync(temporary);
  }
}

function directory(file) {
  noLinks(path.dirname(file));
  const info = stat(file);
  if (!info) mkdirSync(file, { mode: 0o700 });
  else if (!info.isDirectory() || info.isSymbolicLink()) refuse("corrupt-state", 1, true);
  noLinks(file);
}

function checkOptions(options) {
  if (!object(options) || !OPERATIONS.includes(options.operation)) refuse("invalid-operation");
  const allowed = new Set(["operation", "root", "github", "signal", "task", "owner", "branch", "path", "expectedRevision", "expectedHead", "usageEnded", "confirmedQuiescent", "expectedNonce", "confirmCreatedByTask"]);
  if (Object.keys(options).some(key => !allowed.has(key))) refuse("invalid-arguments");
  if (options.root !== undefined && (typeof options.root !== "string" || !options.root || options.root.includes("\0"))) refuse("invalid-root");
  if (options.github !== undefined && typeof options.github !== "function") refuse("invalid-arguments");
  if (options.signal !== undefined && !(options.signal instanceof AbortSignal)) refuse("invalid-arguments");
  if (options.task !== undefined && !isUuid(options.task)) refuse("invalid-task");
  if (options.owner !== undefined && (typeof options.owner !== "string" || options.owner.trim() !== options.owner
    || !options.owner || options.owner.length > 128 || /[\x00-\x1f\x7f]/.test(options.owner))) refuse("invalid-owner");
  if (options.expectedRevision !== undefined && !integer(options.expectedRevision)) refuse("invalid-revision");
  if (options.expectedHead !== undefined && !isSha(options.expectedHead)) refuse("invalid-head");
  if (options.expectedNonce !== undefined && !isUuid(options.expectedNonce)) refuse("invalid-nonce");
  for (const key of ["usageEnded", "confirmedQuiescent", "confirmCreatedByTask"]) if (options[key] !== undefined && options[key] !== true) refuse("invalid-arguments");
  const keys = {
    create: options.task ? ["task", "owner", "expectedRevision", "confirmCreatedByTask"] : ["owner", "branch", "path"],
    status: ["task"], finish: ["task", "owner", "expectedRevision", "expectedHead", "usageEnded"],
    retry: ["task"], resume: ["task", "owner", "expectedRevision"],
    "recover-guard": ["expectedNonce", "confirmedQuiescent"],
  }[options.operation];
  if (Object.keys(options).some(key => !["operation", "root", "github", "signal", ...keys].includes(key))) refuse("invalid-arguments");
  const required = {
    create: options.task ? ["task", "owner", "expectedRevision"] : ["owner", "branch", "path"],
    finish: ["task", "owner", "expectedRevision", "expectedHead", "usageEnded"], resume: ["task", "owner", "expectedRevision"],
  }[options.operation] ?? [];
  if (required.some(key => options[key] === undefined)) refuse("missing-argument");
  if (options.operation === "create" && !options.task) {
    try { validateBranch(options.branch); } catch { refuse("invalid-branch"); }
    if (typeof options.path !== "string" || !options.path || options.path.includes("\0")) refuse("invalid-path");
  }
  if (options.operation === "recover-guard" && Boolean(options.expectedNonce) !== Boolean(options.confirmedQuiescent)) refuse("missing-argument");
}

function cancelled(ctx) { if (ctx.cancelled) refuse("cancelled", 1, true); }

async function gitCommand(ctx, cwd, args, { input, allowed = [0] } = {}) {
  cancelled(ctx);
  const prefix = ["-c", "core.fsmonitor=false", "-c", "submodule.recurse=false", "-c", "maintenance.auto=false", "-c", "gc.auto=0"];
  if (ctx.hooks) prefix.push("-c", `core.hooksPath=${ctx.hooks}`);
  const result = await new Promise((resolve, reject) => {
    let child, timer, escalation, deadline, errorCode = null, settled = false, length = 0;
    const stdout = [];
    const end = (value, error) => {
      if (settled) return;
      settled = true; clearTimeout(timer); clearTimeout(escalation); clearTimeout(deadline);
      if (error) reject(error); else resolve(value);
    };
    const stop = code => {
      if (errorCode) return;
      errorCode = code;
      child.kill("SIGTERM");
      escalation = setTimeout(() => child.kill("SIGKILL"), 1000);
      deadline = setTimeout(() => { ctx.unsettled = true; end(null, new WorktreeFailure("git-process-unsettled", 1, true)); }, 4000);
    };
    try {
      child = spawn("git", ["-C", cwd, ...prefix, ...args], {
        env: { ...process.env, GIT_NO_REPLACE_OBJECTS: "1", GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" },
        stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"], windowsHide: true,
      });
      ctx.children.set(child, () => stop("cancelled"));
      timer = setTimeout(() => stop("git-timeout"), 20000);
      child.stdout.on("data", bytes => { length += bytes.length; if (length > MAX_OUTPUT) stop("git-output-limit"); else stdout.push(bytes); });
      child.stderr.on("data", bytes => { length += bytes.length; if (length > MAX_OUTPUT) stop("git-output-limit"); });
      child.once("error", () => { errorCode = "git-launch-failed"; });
      child.once("close", (status, signal) => {
        ctx.children.delete(child);
        let output;
        try { output = decoder.decode(Buffer.concat(stdout)); } catch { errorCode = "git-output-invalid"; }
        if (errorCode || signal) end(null, new WorktreeFailure(errorCode ?? "git-interrupted", 1, ctx.cancelled));
        else end({ status, output });
      });
      if (input !== undefined) { child.stdin.on("error", () => {}); child.stdin.end(input); }
    } catch { end(null, new WorktreeFailure("git-launch-failed", 1)); }
  });
  cancelled(ctx);
  if (!allowed.includes(result.status)) refuse("git-inspection-failed", 1);
  return result;
}

async function gitText(ctx, cwd, args, options) {
  return (await gitCommand(ctx, cwd, args, options)).output.replace(/\n$/, "");
}

async function context(options) {
  const ctx = { root: realpathSync.native(path.resolve(options.root ?? process.cwd())), children: new Map(), cancelled: false, unsettled: false, github: options.github };
  const top = await gitText(ctx, ctx.root, ["rev-parse", "--show-toplevel"]);
  ctx.root = native(top);
  ctx.common = native(path.resolve(ctx.root, await gitText(ctx, ctx.root, ["rev-parse", "--git-common-dir"])));
  ctx.directory = path.join(ctx.common, NAMESPACE);
  ctx.tasks = path.join(ctx.directory, "tasks");
  ctx.guardPath = path.join(ctx.directory, "command.guard");
  ctx.retired = path.join(ctx.directory, "retired-guards");
  ctx.hooks = path.join(ctx.directory, "empty-hooks");
  noLinks(ctx.directory, true);
  noLinks(ctx.hooks, true);
  if (stat(ctx.hooks) && (!stat(ctx.hooks).isDirectory() || readdirSync(ctx.hooks).length)) refuse("hooks-directory-not-empty", 1, true);
  return ctx;
}

async function registry(ctx) {
  try { return parseWorktreeList((await gitCommand(ctx, ctx.root, ["worktree", "list", "--porcelain", "-z"])).output); }
  catch { refuse("registry-unverified", 1, true); }
}

function validPath(value) { return typeof value === "string" && !value.includes("\0") && path.isAbsolute(value) && path.resolve(value) === value; }
function keys(value, allowed) { return object(value) && Object.keys(value).every(key => allowed.includes(key)) && allowed.every(key => Object.hasOwn(value, key)); }

function validRecord(record, ctx, id) {
  if (!keys(record, ["schemaVersion", "taskId", "instanceId", "revision", "owner", "commonGit", "path", "gitDir", "branch", "baseSha", "state", "createdAt", "removedAt", "closing", "removalStartedAt", "branchCleanup", "lastReasons"])) return false;
  if (record.schemaVersion !== 1 || record.taskId !== id || !isUuid(id) || !isUuid(record.instanceId) || !integer(record.revision)
    || typeof record.owner !== "string" || !record.owner || record.owner.trim() !== record.owner || record.owner.length > 128 || /[\x00-\x1f\x7f]/.test(record.owner)
    || record.commonGit !== ctx.common || !validPath(record.path) || !isSha(record.baseSha) || !STATES.includes(record.state)
    || !date(record.createdAt) || !Array.isArray(record.lastReasons) || record.lastReasons.length > 32 || !record.lastReasons.every(code => isCode(code))) return false;
  try { validateBranch(record.branch); } catch { return false; }
  if (record.gitDir !== null && (!validPath(record.gitDir) || path.dirname(record.gitDir) !== path.join(ctx.common, "worktrees"))) return false;
  if (record.state !== "creating" && record.gitDir === null) return false;
  if (record.state === "removed" ? !date(record.removedAt) : record.removedAt !== null) return false;
  if (record.removalStartedAt !== null && !date(record.removalStartedAt)) return false;
  const closure = record.closing;
  if (["creating", "active"].includes(record.state)) {
    if (closure !== null || record.removalStartedAt !== null) return false;
  } else {
    if (!keys(closure, ["headSha", "requestedAt", "sourceRevision", "fileFingerprint", "preservation", "usageEnded"])
      || !isSha(closure.headSha) || !date(closure.requestedAt) || !integer(closure.sourceRevision) || closure.sourceRevision >= record.revision
      || !isDigest(closure.fileFingerprint) || closure.usageEnded !== true) return false;
    const proof = closure.preservation;
    if (!object(proof) || !["remote-head", "ancestor", "merged-pr"].includes(proof.kind) || proof.headSha !== closure.headSha || !isSha(proof.devSha) || !date(proof.checkedAt)) return false;
    if (proof.kind === "merged-pr" && (!integer(proof.pr) || !isSha(proof.mergeSha))) return false;
    const proofKeys = ["kind", "headSha", "devSha", "checkedAt", ...(proof.kind === "merged-pr" ? ["pr", "mergeSha"] : [])];
    if (!keys(proof, proofKeys)) return false;
  }
  const branch = record.branchCleanup;
  if (!keys(branch, ["state", "headSha", "result"]) || !["not-started", "attempted", "finished"].includes(branch.state)
    || branch.headSha !== (closure?.headSha ?? null) || branch.state !== "not-started" && record.state !== "removed") return false;
  if (branch.state === "finished") {
    if (typeof branch.result === "string") {
      if (!["branch-missing", "branch-changed", "branch-in-use", "branch-inspection-failed", "invalid-branch-result"].includes(branch.result)) return false;
    } else if (!validateBranchReport(branch.result, record)) return false;
  }
  else if (branch.result !== null) return false;
  return true;
}

function inventory(ctx) {
  if (!stat(ctx.tasks)) return { records: [], errors: [] };
  noLinks(ctx.tasks);
  if (!stat(ctx.tasks).isDirectory()) refuse("corrupt-state", 1, true);
  const records = [], errors = [];
  for (const name of readdirSync(ctx.tasks).sort()) {
    if (name.startsWith(".tmp-") && isUuid(name.slice(5)) && stat(path.join(ctx.tasks, name))?.isFile()) continue;
    const id = name.endsWith(".json") ? name.slice(0, -5) : null;
    try {
      if (!isUuid(id ?? "")) refuse("corrupt-state", 1, true);
      const record = readJson(path.join(ctx.tasks, name));
      if (!validRecord(record, ctx, id)) refuse("corrupt-state", 1, true);
      records.push(record);
    } catch { errors.push(id && isUuid(id) ? id : null); }
  }
  return { records, errors };
}

function guardOwner(ctx, location = ctx.guardPath) {
  if (!stat(location)) return null;
  noLinks(location);
  if (!stat(location).isDirectory()) refuse("guard-unverified", 1, true);
  const owner = readJson(path.join(location, "owner.json"));
  if (!keys(owner, ["schemaVersion", "nonce", "host", "pid", "operation", "taskId", "createdAt"]) || owner.schemaVersion !== 1
    || !isUuid(owner.nonce) || typeof owner.host !== "string" || !owner.host || owner.host.length > 255
    || !integer(owner.pid) || !OPERATIONS.includes(owner.operation) || owner.taskId !== null && !isUuid(owner.taskId)
    || !date(owner.createdAt)) refuse("guard-unverified", 1, true);
  return owner;
}

function pidState(owner) {
  if (owner.host !== hostname()) return "unknown";
  try { process.kill(owner.pid, 0); return "alive"; }
  catch (error) { return error.code === "ESRCH" ? "dead" : "unknown"; }
}

function guardView(ctx) {
  try {
    const owner = guardOwner(ctx);
    return owner ? { ...owner, status: pidState(owner) === "dead" ? "abandoned" : "held" } : null;
  } catch { return { status: "unknown", nonce: null }; }
}

function ensureGuard(ctx) {
  cancelled(ctx);
  if (ctx.unsettled || !ctx.guard || guardOwner(ctx)?.nonce !== ctx.guard.nonce) refuse("guard-changed", 1, true);
}

function saveRecord(ctx, record, change, initial = false) {
  ensureGuard(ctx);
  const file = path.join(ctx.tasks, `${record.taskId}.json`);
  if (!initial && JSON.stringify(readJson(file)) !== JSON.stringify(record)) refuse("state-changed", 1, true);
  if (record.revision >= Number.MAX_SAFE_INTEGER) refuse("revision-exhausted", 1, true);
  const next = initial ? record : { ...structuredClone(record), ...change, revision: record.revision + 1 };
  if (!validRecord(next, ctx, next.taskId)) refuse("invalid-state-transition", 1, true);
  atomicJson(file, next, initial);
  if (!initial) Object.assign(record, next);
}

function acquire(ctx, operation, taskId) {
  directory(ctx.directory); directory(ctx.tasks); directory(ctx.retired); directory(ctx.hooks);
  if (readdirSync(ctx.hooks).length) refuse("hooks-directory-not-empty", 1, true);
  try { mkdirSync(ctx.guardPath, { mode: 0o700 }); }
  catch (error) {
    if (error.code === "EEXIST") refuse(guardView(ctx)?.status === "abandoned" ? "guard-recovery-required" : "guard-held", 2, true);
    refuse("guard-write-failed", 1, true);
  }
  const owner = { schemaVersion: 1, nonce: randomUUID(), host: hostname(), pid: process.pid, operation, taskId: taskId ?? null, createdAt: now() };
  atomicJson(path.join(ctx.guardPath, "owner.json"), owner, true);
  ctx.guard = owner;
}

function release(ctx) {
  if (!ctx.guard || ctx.unsettled || ctx.children.size) return;
  if (guardOwner(ctx)?.nonce !== ctx.guard.nonce) refuse("guard-changed", 1, true);
  const extras = readdirSync(ctx.guardPath).filter(name => name !== "owner.json");
  if (extras.some(name => !name.startsWith(".tmp-") || !isUuid(name.slice(5)) || !stat(path.join(ctx.guardPath, name))?.isFile())) refuse("guard-unverified", 1, true);
  for (const name of extras) unlinkSync(path.join(ctx.guardPath, name));
  unlinkSync(path.join(ctx.guardPath, "owner.json"));
  rmdirSync(ctx.guardPath); ctx.guard = null;
}

function marker(record) {
  if (!stat(path.join(record.gitDir, MARKER))) refuse("identity-changed");
  const value = readJson(path.join(record.gitDir, MARKER));
  if (!keys(value, ["schemaVersion", "taskId", "instanceId"]) || value.schemaVersion !== 1
    || value.taskId !== record.taskId || value.instanceId !== record.instanceId) refuse("identity-changed");
}

async function identityFor(ctx, record, { markerRequired = true } = {}) {
  const entries = await registry(ctx);
  const entry = entries.find(item => samePath(path.resolve(item.path), record.path));
  if (!entry || !stat(record.path)) refuse("identity-changed");
  if (entry.locked) refuse("worktree-locked");
  if (entry.prunable) refuse("identity-unverified", 1);
  const root = native(record.path);
  if (!samePath(root, record.path)) refuse("identity-changed");
  const pointer = stat(path.join(root, ".git"));
  if (!pointer?.isFile() || pointer.isSymbolicLink() || pointer.nlink !== 1n) refuse("identity-changed");
  const top = native(await gitText(ctx, root, ["rev-parse", "--show-toplevel"]));
  const common = native(path.resolve(root, await gitText(ctx, root, ["rev-parse", "--git-common-dir"])));
  const gitDir = native(await gitText(ctx, root, ["rev-parse", "--absolute-git-dir"]));
  if (!samePath(top, root) || !samePath(common, ctx.common) || path.dirname(gitDir) !== path.join(ctx.common, "worktrees")
    || record.gitDir !== null && !samePath(gitDir, record.gitDir)) refuse("identity-changed");
  const ref = await gitText(ctx, root, ["symbolic-ref", "HEAD"]);
  if (ref !== `refs/heads/${record.branch}` || entry.branch !== ref) refuse("branch-changed");
  const head = await gitText(ctx, root, ["rev-parse", "--verify", "HEAD^{commit}"]);
  if (!isSha(head)) refuse("identity-unverified", 1);
  if (markerRequired) { if (record.gitDir === null) refuse("identity-changed"); marker(record); }
  return { head, gitDir };
}

async function cleanCheckout(ctx, record) {
  for (const name of ["MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "REBASE_HEAD", "BISECT_LOG", "rebase-merge", "rebase-apply", "sequencer", "index.lock", "HEAD.lock"]) {
    const file = path.resolve(record.path, await gitText(ctx, record.path, ["rev-parse", "--git-path", name]));
    if (stat(file)) refuse("git-operation-in-progress");
  }
  const sparse = await gitCommand(ctx, record.path, ["config", "--bool", "core.sparseCheckout"], { allowed: [0, 1] });
  if (sparse.status === 0 && sparse.output.trim() !== "false") refuse("sparse-checkout");
  if (stat(path.join(record.path, ".gitmodules"))) refuse("submodule-unsupported");
  const indexed = (await gitCommand(ctx, record.path, ["ls-files", "--stage", "-z"])).output.split("\0").filter(Boolean);
  if (indexed.some(line => line.startsWith("160000 "))) refuse("submodule-unsupported");
  const flags = (await gitCommand(ctx, record.path, ["ls-files", "-v", "-z"])).output.split("\0").filter(Boolean);
  if (flags.some(line => line[0] === "S" || /[a-z]/.test(line[0]))) refuse("hidden-index-flags");
  const status = await gitCommand(ctx, record.path, ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--ignore-submodules=none"]);
  if (status.output) refuse(record.removalStartedAt ? "partial-removal" : "unpreserved-files");
}

function cacheRoot(relative) {
  return DIRECTORY_CACHE.find(root => relative === root || relative.startsWith(root + "/")) ?? (FILE_CACHE.includes(relative) ? relative : null);
}

async function fingerprint(ctx, record) {
  const tracked = new Set((await gitCommand(ctx, record.path, ["ls-files", "-z"])).output.split("\0").filter(Boolean));
  const parents = new Set();
  for (const file of tracked) for (let parent = path.posix.dirname(file); parent !== "."; parent = path.posix.dirname(parent)) parents.add(parent);
  const entries = [];
  let size = 0;
  function walk(directoryPath, prefix = "") {
    for (const bytes of readdirSync(directoryPath, { encoding: "buffer" })) {
      const name = decoder.decode(bytes);
      const relative = prefix ? `${prefix}/${name}` : name;
      if (relative === ".git") continue;
      if (name === ".git") refuse("nested-repository");
      const full = path.join(directoryPath, name), info = lstatSync(full, { bigint: true });
      const type = info.isSymbolicLink() ? "link" : info.isDirectory() ? "directory" : info.isFile() ? "file" : "other";
      if (type === "other") refuse("unsupported-file-type");
      const root = cacheRoot(relative);
      let link = null;
      if (type === "link") {
        if (!root || relative === root) refuse("linked-path");
        const destination = realpathSync.native(full);
        if (!inside(path.join(record.path, root), destination) || !lstatSync(destination).isFile()) refuse("linked-path");
        link = readlinkSync(full);
      }
      entries.push({ relative, type, root, fields: [relative, type, String(info.size), String(info.mtimeNs), String(info.ctimeNs), link] });
      size += Buffer.byteLength(relative) + 160;
      if (entries.length > 200000 || size > 32 * 1024 * 1024) refuse("inventory-limit", 1);
      if (type === "directory") walk(full, relative);
    }
  }
  walk(record.path);
  const names = entries.map(entry => entry.relative + (entry.type === "directory" ? "/" : ""));
  const ignored = names.length ? await gitCommand(ctx, record.path, ["check-ignore", "--no-index", "--stdin", "-z"], { input: names.join("\0") + "\0", allowed: [0, 1] }) : { output: "" };
  const disposable = new Set(ignored.output.split("\0").filter(Boolean).map(file => file.replace(/\/$/, "")));
  for (const entry of entries) {
    if (entry.type === "link" && tracked.has(entry.relative)) refuse("linked-path");
    if (tracked.has(entry.relative) || entry.type === "directory" && parents.has(entry.relative)) continue;
    if (!entry.root || !disposable.has(entry.relative)) refuse(record.removalStartedAt ? "partial-removal" : "unpreserved-files");
  }
  return createHash("sha256").update(JSON.stringify(entries.sort((a, b) => a.relative < b.relative ? -1 : a.relative > b.relative ? 1 : 0).map(entry => entry.fields))).digest("hex");
}

async function localBranch(ctx, branch) {
  const alias = await gitCommand(ctx, ctx.root, ["symbolic-ref", "--quiet", `refs/heads/${branch}`], { allowed: [0, 1] });
  if (alias.status === 0) refuse("symbolic-ref");
  const ref = await gitCommand(ctx, ctx.root, ["show-ref", "--verify", "--hash", `refs/heads/${branch}`], { allowed: [0, 1, 128] });
  if (ref.status === 0) {
    const sha = ref.output.trim(); if (!isSha(sha)) refuse("invalid-commit", 1); return sha;
  }
  const missing = await gitCommand(ctx, ctx.root, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`], { allowed: [0, 1] });
  if (missing.status === 0) refuse("git-inspection-failed", 1);
  return null;
}

async function remoteSnapshot(ctx, branch) {
  try {
    const refs = ["refs/heads/main", "refs/heads/dev", ...(branch ? [`refs/heads/${branch}`] : [])];
    const raw = await gitText(ctx, ctx.root, ["ls-remote", "--heads", "origin", ...refs]);
    const heads = new Map();
    for (const line of raw.split("\n").filter(Boolean)) {
      const [sha, ref, extra] = line.split("\t");
      if (extra || !isSha(sha) || !refs.includes(ref) || heads.has(ref)) refuse("remote-inspection-failed", 1, true);
      heads.set(ref, sha);
    }
    if (!heads.has("refs/heads/main") || !heads.has("refs/heads/dev")) refuse("protected-remote-missing", 1, true);
    await gitCommand(ctx, ctx.root, ["fetch", "--no-tags", "origin", "refs/heads/dev:refs/remotes/origin/dev"]);
    const devSha = await gitText(ctx, ctx.root, ["rev-parse", "--verify", "refs/remotes/origin/dev^{commit}"]);
    if (devSha !== heads.get("refs/heads/dev")) refuse("origin-dev-changed", 1, true);
    return { devSha, remoteHead: branch ? heads.get(`refs/heads/${branch}`) ?? null : null };
  } catch (error) {
    if (error instanceof WorktreeFailure && error.shared) throw error;
    refuse("remote-inspection-failed", 1, true);
  }
}

async function preservation(ctx, record, head) {
  if (await localBranch(ctx, record.branch) !== head) refuse("branch-changed");
  const { devSha, remoteHead } = await remoteSnapshot(ctx, record.branch);
  if (remoteHead === head) return { kind: "remote-head", headSha: head, devSha, checkedAt: now() };
  const ancestor = await gitCommand(ctx, ctx.root, ["merge-base", "--is-ancestor", head, devSha], { allowed: [0, 1] });
  if (ancestor.status === 0) return { kind: "ancestor", headSha: head, devSha, checkedAt: now() };
  const proof = inspectMergedTaskBranch({ cwd: ctx.root, branch: record.branch, sha: head, devSha, github: ctx.github });
  if (proof.kind !== "merged-pr") refuse(proof.reason, proof.reason === "inspection-failed" ? 1 : 2);
  return { ...proof, checkedAt: now() };
}

async function createTask(ctx, options, records) {
  let record;
  if (options.task) {
    record = records.find(item => item.taskId === options.task);
    if (!record) refuse("task-missing");
    owned(record, options);
    if (record.state !== "creating") refuse("not-creating");
  } else {
    const requested = path.resolve(options.path);
    if (stat(requested)) refuse("path-exists");
    const parent = native(path.dirname(requested));
    if (!stat(parent)?.isDirectory()) refuse("invalid-path");
    const target = path.join(parent, path.basename(requested));
    const entries = await registry(ctx);
    if (inside(ctx.common, target) || inside(target, ctx.common) || entries.some(entry => inside(path.resolve(entry.path), target) || inside(target, path.resolve(entry.path)))) refuse("nested-worktree");
    if (records.some(item => item.branch === options.branch || item.state !== "removed" && (inside(item.path, target) || inside(target, item.path)))) refuse("task-conflict");
    await gitCommand(ctx, ctx.root, ["check-ref-format", "--branch", options.branch]);
    if (await localBranch(ctx, options.branch)) refuse("branch-exists");
    const remote = await remoteSnapshot(ctx, options.branch);
    if (remote.remoteHead) refuse("branch-exists");
    record = { schemaVersion: 1, taskId: randomUUID(), instanceId: randomUUID(), revision: 1, owner: options.owner,
      commonGit: ctx.common, path: target, gitDir: null, branch: options.branch, baseSha: remote.devSha,
      state: "creating", createdAt: now(), removedAt: null, closing: null, removalStartedAt: null,
      branchCleanup: { state: "not-started", headSha: null, result: null }, lastReasons: [] };
    saveRecord(ctx, record, {}, true); records.push(record);
  }
  try {
    const entries = await registry(ctx);
    const connected = entries.find(entry => samePath(path.resolve(entry.path), record.path));
    if (!connected) {
      if (stat(record.path)) refuse("creation-incomplete");
      const branch = await localBranch(ctx, record.branch);
      if (branch && (branch !== record.baseSha || !options.confirmCreatedByTask || entries.some(entry => entry.branch === `refs/heads/${record.branch}`))) refuse("creation-confirmation-required");
      ensureGuard(ctx);
      await gitCommand(ctx, ctx.root, ["worktree", "add", ...(branch ? [] : ["--no-track", "-b", record.branch]), "--", record.path, branch ? record.branch : record.baseSha]);
    }
    const identity = await identityFor(ctx, record, { markerRequired: false });
    if (identity.head !== record.baseSha) refuse("creation-incomplete");
    if (record.gitDir === null) saveRecord(ctx, record, { gitDir: identity.gitDir });
    await cleanCheckout(ctx, record);
    const file = path.join(record.gitDir, MARKER);
    if (stat(file)) marker(record);
    else {
      if (connected && !options.confirmCreatedByTask) refuse("creation-confirmation-required");
      ensureGuard(ctx);
      atomicJson(file, { schemaVersion: 1, taskId: record.taskId, instanceId: record.instanceId }, true);
    }
    saveRecord(ctx, record, { state: "active", lastReasons: [] });
    return row(record, [], "retained", identity.head);
  } catch (error) { error.taskId = record.taskId; throw error; }
}

function owned(record, options) {
  if (record.owner !== options.owner) refuse("owner-mismatch");
  const replay = ["closing", "removed"].includes(record.state) && options.operation === "finish"
    && options.expectedRevision === record.closing.sourceRevision && options.expectedHead === record.closing.headSha;
  if (record.revision !== options.expectedRevision && !replay) refuse("stale-revision");
}

function branchView(record) {
  if (!record || record.branchCleanup.state === "not-started") return { status: "not-requested", reasons: [] };
  if (record.branchCleanup.state === "attempted") return { status: "unverified", reason: "branch-result-unknown", reasons: ["branch-result-unknown"] };
  const result = record.branchCleanup.result;
  if (typeof result === "string") return { status: result === "branch-missing" ? "missing" : result === "branch-changed" || result === "branch-in-use" ? "skipped" : "unverified", reason: result, reasons: [result] };
  const item = result.results[0], reasons = item.reasons;
  const status = item.status === "deleted" ? "deleted" : result.aborted || reasons.some(code => ["inspection-failed", "ci-unverified"].includes(code))
    ? "unverified" : reasons.includes("branch-missing") ? "missing" : "skipped";
  return { status, ...(reasons.length ? { reason: reasons[0] } : {}), reasons, details: result };
}

function row(record, reasons = [], worktree = "retained", headSha = record?.closing?.headSha ?? null) {
  return { taskId: record?.taskId ?? null, path: record?.path ?? null, state: record?.state ?? "unknown", revision: record?.revision ?? null,
    owner: record?.owner ?? null, branchName: record?.branch ?? null, lastReasons: record?.lastReasons ?? [],
    headSha, reasons: [...new Set(reasons)], worktree, branch: branchView(record) };
}

function validateBranchReport(value, record) {
  if (!keys(value, ["apply", "aborted", "results", "summary"]) || value.apply !== true || typeof value.aborted !== "boolean" || !Array.isArray(value.results) || value.results.length !== 1 || !object(value.summary)) return false;
  const item = value.results[0];
  if (!object(item) || item.branch !== record.branch || !["deleted", "skipped"].includes(item.status)
    || !["ancestor", "merged-pr", "unverified"].includes(item.preservation) || !Array.isArray(item.reasons)
    || !item.reasons.every(code => isCode(code)) || !Array.isArray(item.worktrees)
    || item.sha !== undefined && item.sha !== record.closing.headSha
    || item.devSha !== undefined && !isSha(item.devSha) || item.pr !== undefined && !integer(item.pr)
    || item.note !== undefined && item.note !== "branch-config-absent-or-retained"
    || Object.keys(item).some(key => !["branch", "sha", "status", "preservation", "worktrees", "reasons", "reason", "devSha", "pr", "note"].includes(key))) return false;
  if (item.worktrees.some(entry => !keys(entry, ["path", "head", "locked", "prunable", "changes"])
    || typeof entry.path !== "string" || !entry.path || entry.head !== null && !isSha(entry.head)
    || typeof entry.locked !== "boolean" || typeof entry.prunable !== "boolean" || !["clean", "dirty", "unknown"].includes(entry.changes))) return false;
  if (item.status === "skipped" && (!item.reasons.length || item.reason !== item.reasons[0])) return false;
  if (item.status === "deleted" && (item.reasons.length || item.reason !== undefined || !isSha(item.sha) || item.preservation === "unverified")) return false;
  const summary = value.summary;
  const names = ["total", "ancestor", "mergedPr", "unverified", "worktreeInUse", "eligible", "deleted", "skipped"];
  if (!keys(summary, names) || names.some(key => !Number.isSafeInteger(summary[key]) || summary[key] < 0)) return false;
  return summary.total === 1 && summary.ancestor === Number(item.preservation === "ancestor")
    && summary.mergedPr === Number(item.preservation === "merged-pr") && summary.unverified === Number(item.preservation === "unverified")
    && summary.worktreeInUse === Number(item.reasons.includes("worktree-in-use"))
    && summary.eligible === 0 && summary.deleted === Number(item.status === "deleted") && summary.skipped === Number(item.status === "skipped");
}

async function handoffBranch(ctx, record, records) {
  if (record.branchCleanup.state !== "not-started") return;
  if (stat(record.path) || stat(record.gitDir)) refuse("identity-changed");
  const sha = await localBranch(ctx, record.branch);
  const blocked = sha === null ? "branch-missing" : sha !== record.closing.headSha ? "branch-changed"
    : records.some(other => other.taskId !== record.taskId && other.branch === record.branch && other.state !== "removed") ? "branch-in-use" : null;
  if (blocked) { saveRecord(ctx, record, { branchCleanup: { state: "finished", headSha: record.closing.headSha, result: blocked } }); return; }
  saveRecord(ctx, record, { branchCleanup: { state: "attempted", headSha: record.closing.headSha, result: null } });
  ensureGuard(ctx);
  let result;
  try { result = cleanupTaskBranches({ cwd: ctx.root, apply: true, branches: [record.branch], github: ctx.github }); }
  catch {
    saveRecord(ctx, record, { branchCleanup: { state: "finished", headSha: record.closing.headSha, result: "branch-inspection-failed" } });
    refuse("branch-inspection-failed", 1, true);
  }
  if (!validateBranchReport(result, record)) {
    saveRecord(ctx, record, { branchCleanup: { state: "finished", headSha: record.closing.headSha, result: "invalid-branch-result" } });
    refuse("invalid-branch-result", 1, true);
  }
  saveRecord(ctx, record, { branchCleanup: { state: "finished", headSha: record.closing.headSha, result } });
  if (result.aborted) refuse("branch-cleanup-aborted", 1, true);
}

async function finalize(ctx, record, records) {
  const wasRemoved = record.state === "removed";
  if (inside(record.path, realpathSync.native(process.cwd())) || inside(record.path, ctx.root)) refuse("caller-inside-target");
  if (record.state === "closing") {
    const entries = await registry(ctx);
    const present = stat(record.path), metadata = stat(record.gitDir);
    if (!present && !metadata && !entries.some(entry => samePath(path.resolve(entry.path), record.path))) {
      saveRecord(ctx, record, { state: "removed", removedAt: now(), lastReasons: [] });
    } else {
      if (!present || !metadata) refuse("partial-removal");
      let identity = await identityFor(ctx, record);
      if (identity.head !== record.closing.headSha) refuse("head-changed");
      await cleanCheckout(ctx, record);
      if (await fingerprint(ctx, record) !== record.closing.fileFingerprint) refuse(record.removalStartedAt ? "partial-removal" : "files-changed");
      await preservation(ctx, record, identity.head);
      identity = await identityFor(ctx, record);
      if (identity.head !== record.closing.headSha) refuse("head-changed");
      await cleanCheckout(ctx, record);
      if (await fingerprint(ctx, record) !== record.closing.fileFingerprint) refuse("files-changed");
      if (!record.removalStartedAt) saveRecord(ctx, record, { removalStartedAt: now() });
      ensureGuard(ctx);
      try { await gitCommand(ctx, ctx.root, ["worktree", "remove", "--", record.path]); }
      catch (error) { if (ctx.unsettled || ctx.cancelled) throw error; refuse("partial-removal", 1); }
      if (stat(record.path) || stat(record.gitDir) || (await registry(ctx)).some(entry => samePath(path.resolve(entry.path), record.path))) refuse("partial-removal", 1);
      saveRecord(ctx, record, { state: "removed", removedAt: now(), lastReasons: [] });
    }
  }
  await handoffBranch(ctx, record, records);
  return row(record, [], wasRemoved ? "already-removed" : "removed");
}

async function finishTask(ctx, record, options, records) {
  owned(record, options);
  if (record.state === "creating") refuse("creation-incomplete");
  if (record.state === "active") {
    if (inside(record.path, realpathSync.native(process.cwd())) || inside(record.path, ctx.root)) refuse("caller-inside-target");
    const identity = await identityFor(ctx, record);
    if (identity.head !== options.expectedHead) refuse("head-changed");
    ctx.authorizedTask = record.taskId;
    await cleanCheckout(ctx, record);
    const fileFingerprint = await fingerprint(ctx, record);
    const proof = await preservation(ctx, record, identity.head);
    saveRecord(ctx, record, { state: "closing", closing: { headSha: identity.head, requestedAt: now(), sourceRevision: record.revision,
      fileFingerprint, preservation: proof, usageEnded: true }, branchCleanup: { state: "not-started", headSha: identity.head, result: null }, lastReasons: [] });
  } else if (options.expectedHead !== record.closing.headSha) refuse("head-changed");
  ctx.authorizedTask = record.taskId;
  const wasRemoved = record.state === "removed";
  const result = await finalize(ctx, record, records);
  if (wasRemoved) result.worktree = "already-removed";
  return result;
}

async function resumeTask(ctx, record, options) {
  owned(record, options);
  if (record.state !== "closing") refuse("not-closing");
  await identityFor(ctx, record);
  ctx.authorizedTask = record.taskId;
  if (record.removalStartedAt) {
    await cleanCheckout(ctx, record);
    if (await fingerprint(ctx, record) !== record.closing.fileFingerprint) refuse("partial-removal");
  }
  saveRecord(ctx, record, { state: "active", closing: null, removalStartedAt: null,
    branchCleanup: { state: "not-started", headSha: null, result: null }, lastReasons: [] });
  return row(record);
}

async function observe(ctx, record) {
  if (record.state === "removed") return row(record, stat(record.path) || stat(record.gitDir) ? ["path-reused"] : [], "already-removed");
  if (record.state === "creating") return row(record, ["creation-incomplete"], stat(record.path) ? "retained" : "unknown");
  if (!stat(record.path) && !stat(record.gitDir)) return row(record, [record.state === "closing" ? "finalization-pending" : "identity-changed"], "removed");
  try {
    const identity = await identityFor(ctx, record);
    const status = await gitCommand(ctx, record.path, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
    return row(record, status.output ? [record.removalStartedAt ? "partial-removal" : "unpreserved-files"] : [], "retained", identity.head);
  } catch (error) { return row(record, [failure(error).code], stat(record.path) ? "retained" : "unknown"); }
}

async function statusReport(ctx, options, report) {
  const entries = await registry(ctx), found = inventory(ctx);
  const records = options.task ? found.records.filter(record => record.taskId === options.task) : found.records;
  if (options.task && !records.length && !found.errors.includes(options.task)) refuse("task-missing");
  for (const record of records) report.results.push(await observe(ctx, record));
  for (const id of found.errors) report.results.push({ ...row(null, ["corrupt-state"], "unknown"), taskId: id });
  if (!options.task) for (const entry of entries) {
    if (records.some(record => record.state !== "removed" && samePath(record.path, path.resolve(entry.path)))) continue;
    report.results.push({ ...row(null, ["unmanaged", ...(entry.locked ? ["worktree-locked"] : [])], stat(entry.path) ? "retained" : "unknown", entry.head), path: entry.path, state: "unmanaged" });
  }
  report.guard = guardView(ctx);
  report.aborted = found.errors.length > 0 || report.guard?.status === "unknown";
  return report.aborted ? 1 : 0;
}

function recover(ctx, options, report) {
  if (!options.expectedNonce) { report.guard = guardView(ctx); return report.guard?.status === "unknown" ? 1 : 0; }
  const destination = path.join(ctx.retired, options.expectedNonce);
  noLinks(destination, true);
  if (stat(destination)) {
    const previous = guardOwner(ctx, destination);
    if (previous?.nonce !== options.expectedNonce) refuse("guard-unverified", 1, true);
    report.guard = { ...previous, status: "recovered" }; return 0;
  }
  const owner = guardOwner(ctx);
  if (!owner || owner.nonce !== options.expectedNonce) refuse("guard-changed", 2, true);
  if (pidState(owner) !== "dead") refuse("quiescence-required", 2, true);
  directory(ctx.retired);
  if (guardOwner(ctx)?.nonce !== owner.nonce) refuse("guard-changed", 2, true);
  try { renameSync(ctx.guardPath, destination); }
  catch (error) {
    if (!["EEXIST", "ENOTEMPTY", "EPERM", "EACCES"].includes(error.code) || guardOwner(ctx, destination)?.nonce !== owner.nonce) refuse("guard-recovery-failed", 1, true);
  }
  if (guardOwner(ctx, destination)?.nonce !== owner.nonce) refuse("guard-unverified", 1, true);
  report.guard = { ...owner, status: "recovered" };
  return 0;
}

function resultCode(result) {
  if (result.branch.status === "unverified") return 1;
  return result.branch.status === "skipped" ? 2 : 0;
}

export async function manageTaskWorktrees(options) {
  const report = { schemaVersion: 1, operation: OPERATIONS.includes(options?.operation) ? options.operation : null, results: [], aborted: false };
  let ctx, exitCode = 0, records = [], selected = null;
  const interrupt = () => { if (ctx) { ctx.cancelled = true; for (const stop of ctx.children.values()) stop(); } };
  try {
    checkOptions(options);
    if (options.signal?.aborted) refuse("cancelled", 1, true);
    ctx = await context(options);
    process.on("SIGINT", interrupt); process.on("SIGTERM", interrupt); options.signal?.addEventListener("abort", interrupt, { once: true });
    if (options.signal?.aborted) interrupt();
    cancelled(ctx);
    if (options.operation === "status") return { report, exitCode: await statusReport(ctx, options, report) };
    if (options.operation === "recover-guard") return { report, exitCode: recover(ctx, options, report) };
    const found = inventory(ctx);
    if (found.errors.length) refuse("corrupt-state", 1, true);
    records = found.records;
    if (options.operation === "retry" && !options.task && !records.some(record => record.state === "closing" || record.state === "removed" && record.branchCleanup.state === "not-started")) return { report, exitCode: 0 };
    acquire(ctx, options.operation, options.task);
    const refreshed = inventory(ctx);
    if (refreshed.errors.length) refuse("corrupt-state", 1, true);
    records = refreshed.records;
    if (options.operation === "create") report.results.push(await createTask(ctx, options, records));
    else {
      const targets = options.task ? records.filter(record => record.taskId === options.task)
        : records.filter(record => record.state === "closing" || record.state === "removed" && record.branchCleanup.state === "not-started");
      if (options.task && !targets.length) refuse("task-missing");
      for (let index = 0; index < targets.length; index++) {
        selected = targets[index];
        ctx.authorizedTask = null;
        try {
          let result;
          if (options.operation === "finish") result = await finishTask(ctx, selected, options, records);
          else if (options.operation === "resume") result = await resumeTask(ctx, selected, options);
          else {
            if (!["closing", "removed"].includes(selected.state)) refuse("not-closing");
            ctx.authorizedTask = selected.taskId;
            result = await finalize(ctx, selected, records);
          }
          report.results.push(result);
          const code = resultCode(result); exitCode = code === 1 || exitCode === 1 ? 1 : Math.max(code, exitCode);
        } catch (error) {
          let problem = failure(error);
          if (ctx.authorizedTask === selected.taskId && !problem.shared && !ctx.unsettled && !ctx.cancelled) {
            try { saveRecord(ctx, selected, { lastReasons: [problem.code] }); }
            catch (writeError) { problem = failure(writeError); }
          }
          const observed = await observe(ctx, selected).catch(() => row(selected, [], "unknown"));
          observed.reasons = [...new Set([...observed.reasons, problem.code])];
          report.results.push(observed);
          exitCode = problem.exitCode === 1 || exitCode === 1 ? 1 : 2;
          if (problem.shared || ctx.unsettled || ctx.cancelled) {
            report.aborted = true;
            for (const remaining of targets.slice(index + 1)) report.results.push(row(remaining, ["batch-aborted"], "unknown"));
            break;
          }
        }
      }
    }
  } catch (error) {
    const problem = failure(error);
    selected = selected ?? records.find(record => record.taskId === (error.taskId ?? options?.task));
    if (selected && !report.results.some(item => item.taskId === selected.taskId)) report.results.push(row(selected, [problem.code], "unknown"));
    if (!selected) report.error = problem.code;
    report.aborted = true; exitCode = problem.exitCode;
    if (ctx) report.guard = guardView(ctx);
  } finally {
    if (ctx?.guard) {
      try { release(ctx); }
      catch { report.aborted = true; report.error = "guard-release-failed"; exitCode = 1; }
    }
    process.off("SIGINT", interrupt); process.off("SIGTERM", interrupt);
    if (options?.signal instanceof AbortSignal) options.signal.removeEventListener("abort", interrupt);
  }
  return { report, exitCode };
}

const usage = "Usage: npm run worktrees -- <create|status|finish|retry|resume|recover-guard> [--root <control-checkout>] [options]\ncreate --owner <owner> --branch harness/<topic> --path <new-path>\ncreate --task <id> --owner <owner> --expected-revision <n> [--confirm-created-by-task]\nstatus [--task <id>]\nfinish --task <id> --owner <owner> --expected-revision <n> --expected-head <sha> --usage-ended\nretry [--task <id>]\nresume --task <id> --owner <owner> --expected-revision <n>\nrecover-guard [--expected-nonce <nonce> --confirmed-quiescent]";

function argumentsFrom(args) {
  const options = { operation: args[0] };
  const values = { "--root": "root", "--task": "task", "--owner": "owner", "--branch": "branch", "--path": "path", "--expected-revision": "expectedRevision", "--expected-head": "expectedHead", "--expected-nonce": "expectedNonce" };
  const flags = { "--usage-ended": "usageEnded", "--confirmed-quiescent": "confirmedQuiescent", "--confirm-created-by-task": "confirmCreatedByTask" };
  for (let index = 1; index < args.length; index++) {
    const key = values[args[index]] ?? flags[args[index]];
    if (!key || options[key] !== undefined) refuse("invalid-arguments");
    if (flags[args[index]]) options[key] = true;
    else {
      const value = args[++index];
      if (value === undefined || value.startsWith("--")) refuse("missing-argument");
      if (key === "expectedRevision") { if (!/^[1-9][0-9]*$/.test(value)) refuse("invalid-revision"); options[key] = Number(value); }
      else options[key] = value;
    }
  }
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") console.log(usage);
  else {
    try {
      const { report, exitCode } = await manageTaskWorktrees(argumentsFrom(args));
      console.log(JSON.stringify(report, null, 2)); process.exitCode = exitCode;
      if (report.error && exitCode === 2) console.error(usage);
    } catch (error) {
      const problem = failure(error);
      console.log(JSON.stringify({ schemaVersion: 1, operation: OPERATIONS.includes(args[0]) ? args[0] : null, results: [], aborted: true, error: problem.code }));
      console.error(usage); process.exitCode = problem.exitCode;
    }
  }
}
