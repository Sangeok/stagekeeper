// Fixed read operations over a private, disposable Git database. Repository
// config, hooks, credentials and object alternates never enter this database.
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, lstatSync, realpathSync } from "node:fs";
import { mkdir, mkdtemp, open, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const MAX_BYTES = 1024 * 1024, MAX_OBJECT = 128 * MAX_BYTES, MAX_TOTAL = 2 * 1024 * MAX_BYTES;
const oid = value => typeof value === "string" && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value);
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
// Windows lstat reports dev=0 whereas fstat reports the volume serial number.
// Both report the same file index; inode plus timestamps/size fence replacements.
const identity = stat => [process.platform === "win32" ? "" : stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(":");
const check = signal => signal?.throwIfAborted();
const canonical = value => process.platform === "win32" ? value.toLowerCase() : value;
export const roleGitTool = {
  name: "role_git_read",
  description: "Read scoped Git evidence without a shell. head returns HEAD; show reads one file at HEAD or the supplied planCommit; diff compares HEAD (or planCommit) with current bytes; status reports staged/worktree changes for explicit files only. Paths must be absolute permitted regular files (deleted files allowed). No directory, glob, rename tracking, ignore rules, filters or line-ending conversion. Git metadata and original files are never written. Output is bounded; refusals are blocked, never passed.",
  inputSchema: { type: "object", properties: {
    operation: { type: "string", enum: ["head", "show", "diff", "status"] },
    paths: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 50 },
    ref: { type: "string", description: "HEAD (default) or the exact supplied planCommit. Only show/diff accept ref." },
  }, required: ["operation"], additionalProperties: false },
};

// Git metadata is trusted as data, never as executable configuration. Worktrees
// may locate that data outside root; reject aliases throughout both real chains.
function regularPath(target, absent = false) {
  target = path.resolve(target);
  let current = path.parse(target).root;
  for (const part of target.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try {
      const stat = lstatSync(current, { bigint: true });
      if (stat.isSymbolicLink() || (stat.isFile() && stat.nlink !== 1n)) throw new Error("Git data alias refused");
    } catch (error) { if (error.code !== "ENOENT" || !absent) throw error; }
  }
  if (existsSync(target) && canonical(realpathSync(target)) !== canonical(target)) throw new Error("Git data alias refused");
  return target;
}

async function bytesAt(target, limit, signal, resolve = regularPath) {
  check(signal); resolve(target);
  const before = lstatSync(target, { bigint: true });
  if (!before.isFile() || before.size > BigInt(limit)) throw new Error("Git data size/type refused");
  const file = await open(target, "r");
  try {
    if (identity(await file.stat({ bigint: true })) !== identity(before)) throw new Error("Git data changed while opening");
    const buffer = Buffer.alloc(Number(before.size) + 1); let length = 0;
    while (length < buffer.length) {
      check(signal); const { bytesRead } = await file.read(buffer, length, buffer.length - length, null);
      if (!bytesRead) break; length += bytesRead;
    }
    const bytes = buffer.subarray(0, length);
    check(signal); resolve(target);
    if (bytes.length > limit || identity(await file.stat({ bigint: true })) !== identity(before)
      || identity(lstatSync(target, { bigint: true })) !== identity(before)) throw new Error("Git data changed while reading");
    return bytes;
  } finally { await file.close(); }
}

function text(bytes) {
  if (bytes.includes(0)) throw new Error("Binary Git evidence refused");
  const value = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (value.includes("\0")) throw new Error("Binary Git evidence refused");
  return value;
}

async function layout(root, signal) {
  let directory = regularPath(path.join(root, ".git"));
  if (lstatSync(directory).isFile()) {
    const match = /^gitdir: ([^\r\n\0]+)\r?\n?$/.exec(text(await bytesAt(directory, 4096, signal)));
    if (!match) throw new Error("Git worktree pointer refused");
    directory = regularPath(path.resolve(root, match[1]));
  }
  let common = directory;
  if (existsSync(path.join(directory, "commondir"))) {
    const value = text(await bytesAt(path.join(directory, "commondir"), 4096, signal)).trim();
    if (!value || /[\0\r\n]/.test(value)) throw new Error("Git common directory refused");
    common = regularPath(path.resolve(directory, value));
  }
  const headFile = path.join(directory, "HEAD"), headText = text(await bytesAt(headFile, 4096, signal)).trim();
  let head = headText;
  if (headText.startsWith("ref: ")) {
    const ref = headText.slice(5);
    if (!/^refs\/heads\/[A-Za-z0-9_./-]+$/.test(ref) || ref.split("/").some(part => !part || part === "." || part === "..")) throw new Error("Git HEAD reference refused");
    const loose = path.join(common, ref);
    if (existsSync(loose)) head = text(await bytesAt(loose, 4096, signal)).trim();
    else {
      const packed = text(await bytesAt(path.join(common, "packed-refs"), MAX_BYTES, signal));
      const rows = packed.split(/\r?\n/).filter(line => line.endsWith(` ${ref}`));
      if (rows.length !== 1) throw new Error("Git HEAD is not locally available");
      head = rows[0].split(" ")[0];
    }
  }
  if (!oid(head)) throw new Error("Git HEAD commit refused");
  // A fresh snapshot has no alternate or promisor source and never fetches.
  const alternates = path.join(common, "objects/info/alternates");
  if (existsSync(alternates) && text(await bytesAt(alternates, MAX_BYTES, signal)).trim()) throw new Error("Git object alternates unsupported");
  return { directory, common, head };
}

async function copyObjects(common, destination, signal) {
  let total = 0, files = 0;
  const source = regularPath(path.join(common, "objects"));
  await mkdir(destination, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    check(signal); const from = regularPath(path.join(source, entry.name));
    if (entry.name === "info") continue;
    if (!entry.isDirectory() || !(entry.name === "pack" || /^[a-f0-9]{2}$/.test(entry.name))) throw new Error("Unsupported Git object layout");
    const into = path.join(destination, entry.name); await mkdir(into);
    for (const object of await readdir(from, { withFileTypes: true })) {
      const target = regularPath(path.join(from, object.name));
      if (entry.name === "pack" && /\.(?:promisor|keep|rev)$/.test(object.name)) {
        if (object.name.endsWith(".promisor")) throw new Error("Promisor Git objects unsupported");
        continue;
      }
      if (!object.isFile() || !(entry.name === "pack" ? /^pack-[a-f0-9]{40,64}\.(?:pack|idx)$/.test(object.name) : /^(?:[a-f0-9]{38}|[a-f0-9]{62})$/.test(object.name))) throw new Error("Unsupported Git object file");
      const bytes = await bytesAt(target, MAX_OBJECT, signal);
      total += bytes.length; if (++files > 100000 || total > MAX_TOTAL) throw new Error("Git object snapshot limit exceeded");
      await writeFile(path.join(into, object.name), bytes, { flag: "wx", mode: 0o600 });
    }
  }
}

function executable() {
  const name = process.platform === "win32" ? "git.exe" : "git";
  const envPath = Object.entries(process.env).find(([key]) => key.toUpperCase() === "PATH")?.[1] ?? "";
  for (const directory of envPath.split(path.delimiter)) {
    if (!path.isAbsolute(directory)) continue;
    const candidate = path.join(directory, name);
    if (existsSync(candidate)) return realpathSync(candidate);
  }
  throw new Error("Existing native Git executable unavailable");
}

async function gitRead(directory, git, args, lifecycle, signal) {
  check(signal); await lifecycle.beforeActivate?.(); check(signal);
  const system = process.env.SystemRoot ?? "C:\\Windows", nil = process.platform === "win32" ? "NUL" : "/dev/null";
  const env = { PATH: [path.dirname(git), ...(process.platform === "win32" ? [path.join(system, "System32")] : [])].join(path.delimiter),
    HOME: directory, USERPROFILE: directory, XDG_CONFIG_HOME: directory, APPDATA: directory, LOCALAPPDATA: directory,
    TMP: directory, TEMP: directory, LANG: "C", LC_ALL: "C", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_SYSTEM: nil, GIT_CONFIG_GLOBAL: nil,
    GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0", GIT_NO_REPLACE_OBJECTS: "1", GIT_NO_LAZY_FETCH: "1", GIT_LITERAL_PATHSPECS: "1" };
  if (process.platform === "win32") { env.SystemRoot = system; env.WINDIR = system; }
  const child = spawn(git, ["--no-pager", "--no-optional-locks", "--no-replace-objects", "--no-lazy-fetch", "--literal-pathspecs",
    "-c", "core.fsmonitor=false", "-c", "core.autocrlf=false", "-c", "core.hooksPath=disabled-hooks", "-c", "core.attributesFile=" + nil,
    "-c", "submodule.recurse=false", "--git-dir=" + path.join(directory, "git"), "--work-tree=" + path.join(directory, "repo"), ...args],
  { cwd: directory, env, windowsHide: true, shell: false, stdio: ["ignore", "pipe", "pipe"] });
  const owner = { pid: child.pid, nonce: randomUUID() };
  const output = []; let length = 0, refusal = null, timer, monitor, monitorTask = null;
  const stop = error => { refusal ??= error; child.kill(); };
  const abort = () => stop(signal.reason ?? new Error("Git query stopped"));
  const terminal = new Promise(resolve => {
    child.on("error", error => { refusal ??= error; });
    child.on("close", code => resolve(code));
  });
  const collect = buffers => bytes => {
    length += bytes.length;
    if (length > MAX_BYTES) stop(new Error("Git output limit exceeded")); else buffers.push(bytes);
  };
  child.stdout.on("data", collect(output)); child.stderr.on("data", collect([]));
  signal.addEventListener("abort", abort, { once: true });
  try {
    if (!child.pid) throw new Error("Git reader did not start");
    await lifecycle.onSpawn?.(owner); check(signal);
    await lifecycle.beforeActivate?.();
    timer = setTimeout(() => stop(new Error("Git query timed out")), 10000);
    monitor = setInterval(() => {
      if (monitorTask) return;
      monitorTask = Promise.resolve().then(() => lifecycle.beforeActivate?.()).catch(stop).finally(() => { monitorTask = null; });
    }, 100);
    const code = await terminal;
    if (refusal) throw refusal;
    if (code !== 0) throw new Error("Scoped Git query failed; required local object or operation unavailable");
    check(signal); await lifecycle.beforeActivate?.();
    return Buffer.concat(output);
  } catch (error) { stop(error); await terminal; throw error; }
  finally { clearTimeout(timer); clearInterval(monitor); signal.removeEventListener("abort", abort); await terminal; await monitorTask; if (child.pid) await lifecycle.onSettled?.(owner); }
}

export function createRoleGit({ root, agent, fileBroker, backend = fileBroker, planCommit = null, commonDirectory = null }, lifecycle = {}) {
  if (agent === "pm") throw new Error("PM Git operations refused");
  root = realpathSync(root);
  if (planCommit !== null && !oid(planCommit)) throw new Error("Bound plan commit refused");
  const git = executable(), controller = new AbortController(); let closed = false, pending = null;
  async function execute(args, outerSignal) {
    if (!args || typeof args !== "object" || Array.isArray(args) || Object.keys(args).some(key => !["operation", "paths", "ref"].includes(key))
      || !["head", "show", "diff", "status"].includes(args.operation)) throw new Error("Invalid scoped Git arguments");
    const operation = args.operation, names = args.paths ?? [];
    if (!Array.isArray(names) || names.length > 50 || (operation === "head" ? names.length !== 0 || args.ref !== undefined : !names.length)
      || (operation === "show" && names.length !== 1) || (operation === "status" && args.ref !== undefined)
      || (args.ref !== undefined && args.ref !== "HEAD" && args.ref !== planCommit)) throw new Error("Invalid scoped Git selection");
    const selected = names.map(name => {
      const target = fileBroker.resolveRead(name), relative = path.relative(root, target);
      if (!relative || relative.startsWith(".." + path.sep) || path.isAbsolute(relative) || relative.split(path.sep).some(part => [".git", ".codex", ".claude"].includes(part.toLowerCase()))
        || /^\.env(?:\.|$)/i.test(path.basename(relative))) throw new Error("Git file selection refused");
      if (existsSync(target) && !lstatSync(target).isFile()) throw new Error("Git requires concrete regular files");
      return { target, relative: relative.split(path.sep).join("/") };
    });
    if (new Set(selected.map(row => canonical(row.relative))).size !== selected.length) throw new Error("Duplicate Git paths refused");
    const signal = outerSignal ? AbortSignal.any([controller.signal, outerSignal]) : controller.signal;
    const timeout = AbortSignal.timeout(300000), combined = AbortSignal.any([signal, timeout]);
    check(combined); await lifecycle.beforeActivate?.();
    const location = await layout(root, combined), ref = args.ref === undefined || args.ref === "HEAD" ? location.head : planCommit;
    if (commonDirectory !== null && canonical(location.common) !== canonical(regularPath(commonDirectory))) throw new Error("Git metadata does not match session binding");
    const directory = await mkdtemp(path.join(realpathSync(tmpdir()), "harness-git-")), own = randomUUID();
    await writeFile(path.join(directory, "owner.json"), JSON.stringify({ own }), { mode: 0o600 });
    try {
      await mkdir(path.join(directory, "git")); await mkdir(path.join(directory, "git/refs")); await mkdir(path.join(directory, "repo"));
      const sha256 = location.head.length === 64;
      await writeFile(path.join(directory, "git/config"), `[core]\nrepositoryformatversion = ${sha256 ? 1 : 0}\nbare = false\nautocrlf = false\n${sha256 ? "[extensions]\nobjectFormat = sha256\n" : ""}`);
      await writeFile(path.join(directory, "git/HEAD"), location.head + "\n");
      await copyObjects(location.common, path.join(directory, "git/objects"), combined);
      const indexPath = path.join(location.directory, "index"); let indexHash = null;
      if (operation === "status" || operation === "diff") {
        if (existsSync(indexPath)) {
          const bytes = await bytesAt(indexPath, MAX_OBJECT, combined); indexHash = hash(bytes);
          await writeFile(path.join(directory, "git/index"), bytes);
        } else {
          // Populate only the disposable index; without one Git treats tracked
          // paths as deleted rather than comparing their actual worktree bytes.
          await gitRead(directory, git, ["read-tree", location.head], lifecycle, combined);
        }
      }
      const snapshot = [];
      for (const row of selected) {
        check(combined); fileBroker.resolveRead(row.target);
        let bytes = null;
        if (existsSync(row.target)) bytes = await bytesAt(row.target, MAX_BYTES, combined, value => fileBroker.resolveRead(value));
        snapshot.push({ path: row.target, hash: bytes === null ? null : hash(bytes) });
        if (bytes !== null) { const destination = path.join(directory, "repo", row.relative); await mkdir(path.dirname(destination), { recursive: true }); await writeFile(destination, bytes); }
      }
      let command;
      if (operation === "head") command = ["rev-parse", "--verify", "HEAD^{commit}"];
      if (operation === "show") command = ["cat-file", "blob", ref + ":" + selected[0].relative];
      if (operation === "diff") command = ["diff", "--no-ext-diff", "--no-textconv", "--no-renames", "--ignore-submodules=all", "--no-color", ref, "--", ...selected.map(row => row.relative)];
      if (operation === "status") command = ["status", "--porcelain=v1", "--untracked-files=all", "--no-renames", "--ignore-submodules=all", "--", ...selected.map(row => row.relative)];
      const output = text(await gitRead(directory, git, command, lifecycle, combined));
      if ((await layout(root, combined)).head !== location.head) throw new Error("Git HEAD changed during query");
      if ((operation === "status" || operation === "diff") && (existsSync(indexPath) ? hash(await bytesAt(indexPath, MAX_OBJECT, combined)) : null) !== indexHash)
        throw new Error("Git index changed during query");
      for (const row of snapshot) {
        fileBroker.resolveRead(row.path);
        const current = existsSync(row.path) ? hash(await bytesAt(row.path, MAX_BYTES, combined, value => fileBroker.resolveRead(value))) : null;
        if (current !== row.hash) throw new Error("Git source changed during query");
      }
      check(combined); await lifecycle.beforeActivate?.();
      return { operation, head: location.head, ref: operation === "show" || operation === "diff" ? ref : null, output, files: snapshot, indexSnapshotHash: indexHash,
        scope: "explicit-files", lineEndingConversion: false, originalRepositoryWrites: false, quiescent: true };
    } finally {
      if (realpathSync(directory) !== directory || JSON.parse(await readFile(path.join(directory, "owner.json"), "utf8")).own !== own) throw new Error("Git snapshot owner changed");
      await rm(directory, { recursive: true });
    }
  }
  return { tools: [...backend.tools, roleGitTool],
    call(name, args, signal) {
      if (closed) throw new Error("Git backend closed");
      if (name !== roleGitTool.name) return backend.call(name, args, signal);
      if (pending) throw new Error("Git query already pending");
      pending = execute(args, signal).finally(() => { pending = null; }); return pending;
    },
    async close() { closed = true; controller.abort(); try { await pending; } finally { await backend.close(); } },
  };
}
