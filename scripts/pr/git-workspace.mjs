import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { matchesMacCloseoutHostV1 } from "./macos-closeout-profile.mjs";

export const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export const OID = /^[a-f0-9]{40}$/;
export const ZERO = "0".repeat(40);
export const MAX_JSON = 1024 * 1024;
export const MARKER = "pr-closeout-task.json";
const decoder = new TextDecoder("utf-8", { fatal: true });
const redirected = new Set(["GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR", "GIT_INDEX_FILE", "GIT_NAMESPACE", "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_SHALLOW_FILE", "GIT_REFERENCE_BACKEND", "GIT_CONFIG", "GIT_CONFIG_PARAMETERS"]);

export class PrFailure extends Error {
  constructor(code, exitCode = 2) { super(code); this.code = code; this.exitCode = exitCode; }
}
export function refuse(code, exitCode = 2) { throw new PrFailure(code, exitCode); }
export const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
export const keys = (value, allowed) => object(value) && Object.keys(value).every(key => allowed.includes(key)) && allowed.every(key => Object.hasOwn(value, key));
export const samePath = (a, b) => path.relative(a, b) === "";
export const inside = (parent, child) => { const r = path.relative(parent, child); return r === "" || r !== ".." && !r.startsWith(".." + path.sep) && !path.isAbsolute(r); };
export const digest = value => createHash("sha256").update(value).digest("hex");
export function json(value) {
  const sort = v => Array.isArray(v) ? v.map(sort) : object(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sort(v[k])])) : v;
  return JSON.stringify(sort(value)) + "\n";
}
export function lstat(file) { try { return fs.lstatSync(file, { bigint: true }); } catch (e) { if (e.code === "ENOENT" || e.code === "ENOTDIR") return null; throw e; } }
export function noLinks(file, absent = false) {
  const full = path.resolve(file); let cursor = path.parse(full).root;
  for (const part of full.slice(cursor.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part); const s = lstat(cursor);
    if (!s) { if (absent) continue; refuse("path-unavailable"); }
    if (s.isSymbolicLink() || !samePath(cursor, full) && !s.isDirectory()) refuse("linked-path");
  }
  return full;
}
export function canonical(file) { noLinks(file); return fs.realpathSync.native(file); }
export function readJson(file) {
  noLinks(file); const s = lstat(file);
  if (!s?.isFile() || s.nlink !== 1n || s.size > BigInt(MAX_JSON)) refuse("corrupt-state");
  try { return JSON.parse(decoder.decode(fs.readFileSync(file))); } catch { refuse("corrupt-state"); }
}
export function mkdir(file) {
  noLinks(path.dirname(file)); const s = lstat(file);
  if (!s) fs.mkdirSync(file, { mode: 0o700 });
  else if (!s.isDirectory() || s.isSymbolicLink()) refuse("metadata-path-invalid");
}
export function publishJson(file, value) {
  noLinks(path.dirname(file));
  const bytes = json(value); if (Buffer.byteLength(bytes) > MAX_JSON) refuse("state-too-large");
  if (lstat(file)) { if (json(readJson(file)) === bytes) return; refuse("metadata-collision"); }
  const temporary = path.join(path.dirname(file), ".tmp-" + randomUUID());
  let fd;
  try {
    fd = fs.openSync(temporary, "wx", 0o600); fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
    fs.linkSync(temporary, file);
  } catch (error) {
    if (error instanceof PrFailure) throw error;
    refuse(error.code === "EEXIST" ? "metadata-collision" : "metadata-write-failed", 1);
  } finally { if (fd !== undefined) fs.closeSync(fd); if (lstat(temporary)) fs.unlinkSync(temporary); }
}
export function directoryIdentity(file) {
  const canonicalPath = canonical(file), s = lstat(canonicalPath);
  if (!s?.isDirectory()) refuse("invalid-directory");
  if (process.platform === "win32" && s.dev === 0n) refuse("device-identity-unavailable");
  return { path: canonicalPath, device: String(s.dev), inode: String(s.ino) };
}
export function validateBranch(branch) {
  if (typeof branch !== "string" || !/^harness\/[a-z0-9][a-z0-9._/-]*$/.test(branch) || branch.includes("..")
    || branch.includes("//") || branch.includes("/.") || branch.endsWith("/") || branch.endsWith(".") || branch.endsWith(".lock")) refuse("invalid-branch");
  return branch;
}
export function gitEnvironment(input = process.env) {
  const env = { ...input };
  for (const [key, value] of Object.entries(env)) {
    const normalized = process.platform === "win32" ? key.toUpperCase() : key;
    if (redirected.has(normalized) && value || normalized === "GIT_CONFIG_COUNT" && ![undefined, "", "0"].includes(value)) refuse("git-environment-conflict");
  }
  return Object.freeze({ ...env, GIT_NO_REPLACE_OBJECTS: "1", GIT_NO_LAZY_FETCH: "1", GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" });
}
export async function runCommand(ctx, file, args, { input, timeout = 20000, allowed = [0], diagnostics = false, cwd = ctx.root, env = ctx.env } = {}) {
  if (ctx.signal?.aborted) refuse("cancelled");
  if (ctx.deadline) timeout = Math.min(timeout, Math.floor(ctx.deadline.end - ctx.deadline.clock()));
  if (input !== undefined && Buffer.byteLength(input) > 32 * 1024 * 1024) refuse("input-limit");
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 20000) refuse("invalid-timeout");
  if (args.some(v => typeof v !== "string" || v.includes("\0")) || args.join(" ").length + file.length > 24000) refuse("command-size");
  const result = await new Promise((resolve, reject) => {
    let child, timer, escalation, settle, failed, done = false, bytes = 0, stderrBytes = 0;
    const chunks = [];
    const finish = (value, error) => {
      if (done) return; done = true; clearTimeout(timer); clearTimeout(escalation); clearTimeout(settle);
      ctx.signal?.removeEventListener("abort", abort);
      if (error) reject(error); else resolve(value);
    };
    const stop = code => {
      if (failed) return; failed = code;
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
      escalation = setTimeout(() => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); }, 1000);
      settle = setTimeout(() => { ctx.unsettled = true; finish(null, new PrFailure("process-unsettled", 1)); }, 4000);
    };
    const abort = () => stop("cancelled");
    try {
      child = spawn(file, args, { cwd, env, windowsHide: true, shell: false, stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"] });
      ctx.children.add(child); timer = setTimeout(() => stop("command-timeout"), timeout);
      ctx.signal?.addEventListener("abort", abort, { once: true }); if (ctx.signal?.aborted) abort();
      child.stdout.on("data", b => { bytes += b.length; if (bytes > 16 * 1024 * 1024) stop("output-limit"); else if (!failed) chunks.push(b); });
      child.stderr.on("data", b => { bytes += b.length; stderrBytes += b.length; if (bytes > 16 * 1024 * 1024) stop("output-limit"); });
      child.once("error", () => { failed ??= "command-unavailable"; });
      child.once("close", (status, signal) => {
        ctx.children.delete(child);
        if (failed || signal) { finish(null, new PrFailure(failed ?? "command-interrupted", 1)); return; }
        try { finish({ status, output: decoder.decode(Buffer.concat(chunks)), stderrBytes }); }
        catch { finish(null, new PrFailure("invalid-command-output", 1)); }
      });
      if (input !== undefined) { child.stdin.on("error", () => {}); child.stdin.end(input); }
    } catch { finish(null, new PrFailure("command-unavailable", 1)); }
  });
  if (!allowed.includes(result.status)) refuse("command-failed", 1);
  if (!diagnostics && result.stderrBytes) refuse("command-diagnostic", 1);
  return result;
}
export function git(ctx, args, options = {}) {
  return runCommand(ctx, "git", ["--no-lazy-fetch", "-C", options.cwd ?? ctx.root, "-c", "core.fsmonitor=false", "-c", "submodule.recurse=false",
    "-c", "maintenance.auto=false", "-c", "gc.auto=0", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=" + ctx.hooks, ...args], options);
}
export async function gitText(ctx, args, options) { return (await git(ctx, args, options)).output.replace(/\r?\n$/, ""); }
export async function context(root, signal, ports = {}) {
  const env = gitEnvironment(), requested = canonical(path.resolve(root ?? process.cwd()));
  const ctx = { root: requested, env, signal, children: new Set(), unsettled: false, ports, guards: new Map(), hooks: path.join(requested, ".git", "stagekeeper-pr-closeout-empty-hooks") };
  const top = canonical(await gitText(ctx, ["rev-parse", "--show-toplevel"]));
  if (!samePath(top, requested)) refuse("context-mismatch");
  const pointer = lstat(path.join(top, ".git"));
  let expected;
  if (pointer?.isDirectory()) expected = canonical(path.join(top, ".git"));
  else if (pointer?.isFile() && pointer.nlink === 1n && pointer.size < 4096n) {
    const match = /^gitdir: ([^\0\r\n]+)\r?\n?$/.exec(fs.readFileSync(path.join(top, ".git"), "utf8"));
    if (!match) refuse("context-mismatch"); expected = canonical(path.resolve(top, match[1]));
  } else refuse("context-mismatch");
  const actual = canonical(await gitText(ctx, ["rev-parse", "--absolute-git-dir"]));
  if (!samePath(expected, actual)) refuse("context-mismatch");
  const commonFile = path.join(actual, "commondir");
  const expectedCommon = lstat(commonFile) ? canonical(path.resolve(actual, fs.readFileSync(noLinks(commonFile), "utf8").trim())) : actual;
  ctx.common = canonical(path.resolve(top, await gitText(ctx, ["rev-parse", "--git-common-dir"])));
  if (!samePath(ctx.common, expectedCommon) || await gitText(ctx, ["rev-parse", "--show-object-format"]) !== "sha1") refuse("unsupported-repository");
  ctx.directory = path.join(ctx.common, "stagekeeper-pr-closeout");
  ctx.hooks = path.join(ctx.directory, "empty-hooks"); noLinks(ctx.directory, true); noLinks(ctx.hooks, true);
  if (lstat(ctx.hooks) && (!lstat(ctx.hooks).isDirectory() || fs.readdirSync(ctx.hooks).length)) refuse("unsafe-hooks");
  const url = await gitText(ctx, ["config", "--get", "remote.origin.url"]);
  const match = /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([a-zA-Z0-9-]+\/[a-zA-Z0-9_.-]+?)(?:\.git)?$/.exec(url);
  if (!match) refuse("invalid-origin");
  ctx.repository = match[1]; ctx.origin = url;
  return ctx;
}
export function parseWorktrees(output) {
  if (!output.endsWith("\0\0")) refuse("registry-unverified");
  return output.slice(0, -2).split("\0\0").map(record => {
    const values = {};
    for (const field of record.split("\0")) {
      const i = field.indexOf(" "), key = i < 0 ? field : field.slice(0, i), value = i < 0 ? "" : field.slice(i + 1);
      if (Object.hasOwn(values, key) || !["worktree", "HEAD", "branch", "bare", "detached", "locked", "prunable"].includes(key)) refuse("registry-unverified");
      values[key] = value;
    }
    if (!values.worktree || !path.isAbsolute(values.worktree) || !OID.test(values.HEAD ?? "")
      || ["branch", "bare", "detached"].filter(k => Object.hasOwn(values, k)).length !== 1) refuse("registry-unverified");
    return values;
  });
}
export async function registry(ctx) { return parseWorktrees(await gitText(ctx, ["worktree", "list", "--porcelain", "-z"])); }
export async function branchHead(ctx, branch) {
  validateBranch(branch); const ref = "refs/heads/" + branch;
  const symbolic = await git(ctx, ["symbolic-ref", "--quiet", ref], { allowed: [0, 1] });
  if (symbolic.status === 0) refuse("symbolic-ref");
  const value = await git(ctx, ["show-ref", "--verify", "--hash", ref], { allowed: [0, 1, 128], diagnostics: true });
  if (value.status !== 0) {
    const absent = await git(ctx, ["rev-parse", "--verify", "--quiet", ref], { allowed: [0, 1] });
    if (absent.status === 0) refuse("ref-unverified"); return null;
  }
  const sha = value.output.trim(); if (!OID.test(sha)) refuse("ref-unverified"); return sha;
}
export async function remoteSnapshot(ctx, branch, { fetch = true } = {}) {
  const wanted = ["refs/heads/main", "refs/heads/dev", ...(branch ? ["refs/heads/" + validateBranch(branch)] : [])];
  const rows = (await gitText(ctx, ["ls-remote", "--heads", "origin", ...wanted])).split("\n").filter(Boolean);
  const refs = new Map();
  for (const row of rows) { const [oid, ref] = row.split("\t"); if (!OID.test(oid) || !wanted.includes(ref) || refs.has(ref)) refuse("remote-unverified"); refs.set(ref, oid); }
  if (!refs.has("refs/heads/main") || !refs.has("refs/heads/dev")) refuse("protected-remote-missing");
  if (fetch) {
    await git(ctx, ["fetch", "--no-tags", "origin", "refs/heads/dev:refs/remotes/origin/dev"], { diagnostics: true });
    if (await gitText(ctx, ["rev-parse", "--verify", "refs/remotes/origin/dev"]) !== refs.get("refs/heads/dev")) refuse("origin-dev-changed");
  }
  if (await gitText(ctx, ["config", "--get", "remote.origin.url"]) !== ctx.origin) refuse("origin-changed");
  return { dev: refs.get("refs/heads/dev"), main: refs.get("refs/heads/main"), branch: refs.get("refs/heads/" + branch) ?? null };
}
export async function ancestor(ctx, head, dev) {
  if (!OID.test(head) || !OID.test(dev)) refuse("invalid-commit");
  const r = await git(ctx, ["merge-base", "--is-ancestor", head, dev], { allowed: [0, 1] }); return r.status === 0;
}
export async function worktreeState(ctx, record, { marker = true } = {}) {
  const entries = await registry(ctx), row = entries.find(e => samePath(e.worktree, record.path));
  const exists = lstat(record.path), admin = record.admin && lstat(record.admin);
  if (!exists && !admin && !row) return { present: false };
  if (!exists || !row || record.admin && !admin) refuse("partial-removal");
  if (Object.hasOwn(row, "locked")) refuse("worktree-locked");
  if (Object.hasOwn(row, "prunable") || row.branch !== "refs/heads/" + record.branch) refuse("identity-changed");
  const identity = directoryIdentity(record.path);
  if (!samePath(identity.path, record.path) || record.directory && json(record.directory) !== json(identity)) refuse("identity-changed");
  const pointer = lstat(path.join(record.path, ".git"));
  if (!pointer?.isFile() || pointer.nlink !== 1n) refuse("identity-changed");
  const gitDir = canonical(await gitText(ctx, ["rev-parse", "--absolute-git-dir"], { cwd: record.path }));
  if (path.dirname(gitDir) !== path.join(ctx.common, "worktrees") || record.admin && !samePath(gitDir, record.admin)) refuse("identity-changed");
  const common = canonical(path.resolve(record.path, await gitText(ctx, ["rev-parse", "--git-common-dir"], { cwd: record.path })));
  if (!samePath(common, ctx.common) || !samePath(canonical(await gitText(ctx, ["rev-parse", "--show-toplevel"], { cwd: record.path })), record.path)) refuse("identity-changed");
  const head = await gitText(ctx, ["rev-parse", "--verify", "HEAD^{commit}"], { cwd: record.path });
  if (!OID.test(head) || await gitText(ctx, ["symbolic-ref", "HEAD"], { cwd: record.path }) !== "refs/heads/" + record.branch) refuse("head-changed");
  if (marker) {
    const value = readJson(path.join(gitDir, MARKER));
    if (!keys(value, ["schemaVersion", "installationId", "taskId", "instanceId"]) || value.schemaVersion !== 1
      || value.installationId !== record.installationId || value.taskId !== record.taskId || value.instanceId !== record.instanceId) refuse("identity-changed");
  }
  return { present: true, admin: gitDir, head, directory: identity };
}
function ordinaryIgnoredDirectories(relative, entries, ignored, device) {
  for (let dir = relative; dir !== "."; dir = path.posix.dirname(dir)) {
    const entry = entries.get(dir);
    if (entry?.type !== "directory" || entry.device !== device || !ignored.has(dir)) return false;
  }
  return true;
}

export async function inspectFiles(ctx, record, { purpose }) {
  if (!["handoff", "removal"].includes(purpose)) refuse("invalid-input");
  const cwd = record.path;
  for (const name of ["MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "REBASE_HEAD", "BISECT_LOG", "rebase-merge", "rebase-apply", "sequencer", "index.lock", "HEAD.lock"]) {
    if (lstat(path.resolve(cwd, await gitText(ctx, ["rev-parse", "--git-path", name], { cwd })))) refuse("git-operation-in-progress");
  }
  const sparse = await git(ctx, ["config", "--bool", "core.sparseCheckout"], { cwd, allowed: [0, 1] });
  if (sparse.status === 0 && sparse.output.trim() !== "false") refuse("sparse-checkout");
  if (lstat(path.join(cwd, ".gitmodules"))) refuse("submodule-unsupported");
  const indexed = (await gitText(ctx, ["ls-files", "--stage", "-z"], { cwd })).split("\0");
  if (indexed.some(v => v.startsWith("160000 "))) refuse("submodule-unsupported");
  const flags = (await gitText(ctx, ["ls-files", "-v", "-z"], { cwd })).split("\0").filter(Boolean);
  if (flags.some(v => v[0] === "S" || /[a-z]/.test(v[0]))) refuse("hidden-index-flags");
  if (await gitText(ctx, ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--ignore-submodules=none"], { cwd })) refuse("unpreserved-files");
  const tracked = new Set((await gitText(ctx, ["ls-files", "-z"], { cwd })).split("\0").filter(Boolean));
  const worker = fileURLToPath(new URL("./filesystem-inventory.mjs", import.meta.url));
  const raw = await runCommand(ctx, process.execPath, [worker, cwd]);
  let scan; try { scan = JSON.parse(raw.output); } catch { refuse("inventory-invalid"); }
  if (scan.error) refuse(scan.error);
  if (!Array.isArray(scan.entries) || !scan.identity) refuse("inventory-invalid");
  if (json(scan.identity) !== json(record.directory)) refuse("identity-changed");
  const parents = new Set(); for (const f of tracked) for (let p = path.posix.dirname(f); p !== "."; p = path.posix.dirname(p)) parents.add(p);
  const names = scan.entries.map(e => e.path + (e.type === "directory" ? "/" : ""));
  const ignored = new Set(names.length ? (await git(ctx, ["check-ignore", "--no-index", "--stdin", "-z"], { cwd, input: names.join("\0") + "\0", allowed: [0, 1] })).output.split("\0").filter(Boolean).map(s => s.replace(/\/$/, "")) : []);
  const entries = new Map(scan.entries.map(e => [e.path, e]));
  const caches = ["node_modules", ".next", "src/generated", "coverage", "tsconfig.tsbuildinfo", "next-env.d.ts"];
  const cache = relative => caches.find(v => relative === v || relative.startsWith(v + "/"));
  let removableLinks, indexedPaths, removalBlocked = false;
  for (const e of scan.entries) {
    if (tracked.has(e.path) && e.type !== "link" || e.type === "directory" && parents.has(e.path)) continue;
    const root = cache(e.path);
    if (!root || !ignored.has(e.path)) refuse("unpreserved-files");
    if (e.type === "link") {
      if (tracked.has(e.path) || e.path === root || !e.target || !inside(cwd, e.target)) refuse("linked-path");
      const relative = path.relative(cwd, e.target).split(path.sep).join("/");
      const generated = /^\.next\/node_modules\/(pg|@prisma\/client)-[0-9a-f]{16}$/.exec(e.path);
      if (generated) {
        const target = "node_modules/" + generated[1];
        const parent = path.posix.dirname(e.path);
        const linkText = process.platform === "win32" ? samePath(path.resolve(cwd, parent, e.link), path.join(cwd, target))
          : e.link === path.posix.relative(parent, target);
        if (e.target !== path.join(cwd, target) || !linkText
          || !ordinaryIgnoredDirectories(parent, entries, ignored, scan.identity.device)
          || !ordinaryIgnoredDirectories(target, entries, ignored, scan.identity.device)) refuse("linked-path");
        indexedPaths ??= new Set([...tracked, ...parents].map(name => name.toLowerCase()));
        if (indexedPaths.has(e.path.toLowerCase()) || indexedPaths.has(target)) refuse("linked-path");
        removableLinks ??= matchesMacCloseoutHostV1() && await gitText(ctx, ["--version"]) === "git version 2.50.1 (Apple Git-155)";
        if (!removableLinks) {
          if (purpose === "removal") refuse("linked-path");
          removalBlocked = true;
        }
        continue;
      }
      const destination = entries.get(relative);
      const fileLink = destination?.type === "file" && cache(relative) === root && ignored.has(relative);
      if (!fileLink) refuse("linked-path");
    }
  }
  return { fingerprint: digest(json(scan)), identity: scan.identity, removalReasons: removalBlocked ? ["linked-path"] : [] };
}
export function outsideTarget(ctx, record) {
  if (inside(record.path, ctx.root) || inside(record.path, fs.realpathSync.native(process.cwd()))) refuse("caller-inside-target");
}
export async function checkNewPath(ctx, target, branch, records) {
  validateBranch(branch);
  if (!path.isAbsolute(target) || path.resolve(target) !== target || lstat(target)) refuse("path-conflict");
  noLinks(path.dirname(target)); canonical(path.dirname(target));
  if (inside(ctx.root, target) || inside(target, ctx.root) || records.some(r => r.branch === branch || inside(r.path, target) || inside(target, r.path))) refuse("task-conflict");
  const all = await registry(ctx);
  if (all.some(r => inside(r.worktree, target) || inside(target, r.worktree))) refuse("path-conflict");
  if (await branchHead(ctx, branch)) refuse("branch-conflict");
}
export const monotonic = () => performance.now();
