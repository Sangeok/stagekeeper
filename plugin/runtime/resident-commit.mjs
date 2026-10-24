import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, existsSync, fstatSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, realpathSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { devNull, tmpdir } from "node:os";
import path from "node:path";
import { safeTarget } from "./file-ownership.mjs";
import { childEnvironment } from "./codex-thread.mjs";

const emptyConfig = process.platform === "win32" ? "NUL" : devNull;

export class ResidentCommitInputError extends Error {}

const scopeName = name => process.platform === "win32" ? name.toLowerCase() : name;
const protectedFile = name => name.split("/").some(part => /^(?:\.git(?:$|\b)|\.codex$|\.claude$|\.env(?:$|\.)|node_modules$)/i.test(part))
  || ["harness.json", "harness.lock.json", "CLAUDE.md", "AGENTS.md", ".mcp.json"].some(file => scopeName(file) === scopeName(name)) || scopeName(name).startsWith("docs/harness/");

export function residentGit(root, args, options = {}) {
  const { raw = false, ...settings } = options;
  const result = execFileSync("git", ["-C", root, "--literal-pathspecs", "-c", "core.fsmonitor=false", "-c", "commit.gpgsign=false", ...args],
    { encoding: "utf8", windowsHide: true, maxBuffer: 2 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"],
      env: { ...childEnvironment(), GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: emptyConfig, GIT_NO_REPLACE_OBJECTS: "1", GIT_TERMINAL_PROMPT: "0" }, ...settings });
  return raw ? result : result.trim();
}

export function commitResidentArtifacts({ root, branch, key, next, board, workspaces, files }) {
  if (!/^[A-Za-z0-9_-]+$/.test(key ?? "") || !Array.isArray(files) || files.length === 0 || files.length > 100) throw new Error("Explicit artifact files required");
  if (residentGit(root, ["symbolic-ref", "--short", "HEAD"]) !== branch) throw new Error("Resident branch changed");
  const accepting = next.action === "accept";
  if (next.key !== key || (!accepting && !(next.action === "wait" && next.on === "handoff" && next.resume?.key === key))) throw new Error("Current handoff or acceptance required");
  const artifact = accepting ? `docs/agents/main-loop/${key}.md`
    : typeof next.note === "string" ? path.relative(root, safeTarget(root, next.note.trim())).replaceAll("\\", "/") : null;
  const role = next.resume?.agent;
  const workspace = workspaces.find(value => value.agent === role);
  if (!accepting && ![`docs/plans/${key}.md`, `docs/agents/${role}/${key}.md`].includes(artifact)) throw new Error("Current artifact path required");
  const within = (name, directory) => directory === "." || scopeName(name) === scopeName(directory) || scopeName(name).startsWith(scopeName(directory).replace(/\/$/, "") + "/");
  const permitted = name => !protectedFile(name) && (name === artifact || (!accepting && board.status === "implementing" && workspace
    && !/^docs\/(?:agents|plans)(?:\/|$)/i.test(name) && within(name, workspace.path)
    && !(workspace.readOnly ?? []).some(scope => within(name, scope))
    && !workspaces.some(other => other.agent !== role && within(name, other.path))));
  if (!files.some(file => file.path === artifact) || new Set(files.map(file => file.path)).size !== files.length)
    throw new ResidentCommitInputError(`Include the current artifact ${artifact} exactly once, using repository-relative paths with forward slashes for every file.`);
  const prepared = files.map(file => {
    if (typeof file.path !== "string" || file.path.includes("\\") || !permitted(file.path) || !/^[a-f0-9]{64}$/.test(file.hash ?? "")) throw new Error("Commit path or hash refused");
    const target = safeTarget(root, file.path), relative = path.relative(root, target).replaceAll("\\", "/");
    if (relative !== file.path || path.relative(realpathSync.native(root), realpathSync.native(target)).replaceAll("\\", "/") !== file.path) throw new Error("Noncanonical commit path refused");
    const stat = lstatSync(target);
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > 1024 * 1024) throw new Error("Commit file type or size refused");
    const bytes = readFileSync(target);
    if (createHash("sha256").update(bytes).digest("hex") !== file.hash) throw new Error("Commit file changed");
    return { name: file.path, bytes, mode: stat.mode & 0o111 ? "100755" : "100644" };
  });
  const index = residentGit(root, ["rev-parse", "--path-format=absolute", "--git-path", "index"]);
  safeTarget(realpathSync(path.dirname(index)), path.basename(index));
  const lock = index + ".lock", descriptor = openSync(lock, "wx", 0o600), identity = lstatSync(lock, { bigint: true });
  let scratch, renamed = false, published = false;
  const ownsLock = () => { const current = lstatSync(lock, { bigint: true }); return !current.isSymbolicLink() && current.ino === identity.ino && current.dev === identity.dev; };
  try {
    if (identity.isSymbolicLink() || identity.ino !== fstatSync(descriptor, { bigint: true }).ino) throw new Error("Commit lock identity changed");
    if (residentGit(root, ["diff", "--cached", "--no-ext-diff", "--no-textconv", "--name-only"]) !== "") throw new Error("Existing staged work must be preserved");
    const before = residentGit(root, ["rev-parse", "HEAD"]);
    scratch = mkdtempSync(path.join(realpathSync(tmpdir()), "harness-commit-"));
    mkdirSync(path.join(scratch, "hooks"));
    const temporaryIndex = path.join(scratch, "index");
    if (existsSync(index)) writeFileSync(temporaryIndex, readFileSync(index), { flag: "wx" });
    const env = { ...childEnvironment(), GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: emptyConfig, GIT_NO_REPLACE_OBJECTS: "1", GIT_TERMINAL_PROMPT: "0", GIT_INDEX_FILE: temporaryIndex };
    const git = (args, options = {}) => residentGit(root, ["-c", `core.hooksPath=${path.join(scratch, "hooks")}`, ...args], { ...options, env });
    if (!existsSync(temporaryIndex)) git(["read-tree", before]);
    for (const file of prepared) {
      const object = git(["hash-object", "-w", "--stdin"], { input: file.bytes });
      git(["update-index", "--add", "--cacheinfo", file.mode, object, file.name]);
    }
    const tree = git(["write-tree"]), previousTree = git(["rev-parse", `${before}^{tree}`]);
    const commit = tree === previousTree ? before : git(["-c", "user.name=Stagekeeper", "-c", "user.email=stagekeeper@localhost", "commit-tree", tree, "-p", before, "-m", `Stagekeeper: ${key} ${accepting ? "acceptance" : "handoff"}`]);
    for (const file of prepared) {
      if (!readFileSync(safeTarget(root, file.name)).equals(file.bytes)) throw new Error("Commit file changed");
      if (!git(["cat-file", "blob", `${commit}:${file.name}`], { encoding: null, raw: true }).equals(file.bytes)) throw new Error("Committed artifact differs");
    }
    if (!ownsLock() || residentGit(root, ["symbolic-ref", "--short", "HEAD"]) !== branch) throw new Error("Commit ownership changed");
    writeFileSync(descriptor, readFileSync(temporaryIndex));
    if (commit !== before) { git(["update-ref", "-m", `Stagekeeper: ${key}`, `refs/heads/${branch}`, commit, before]); published = true; }
    else if (git(["rev-parse", "HEAD"]) !== before) throw new Error("HEAD changed while preparing commit");
    closeSync(descriptor);
    renameSync(lock, index); renamed = true;
    return { commit, path: artifact, files: prepared.map(file => file.name) };
  } finally {
    if (!renamed) { try { closeSync(descriptor); } catch { } if (!published && existsSync(lock) && ownsLock()) unlinkSync(lock); }
    if (scratch && path.dirname(scratch) === realpathSync(tmpdir()) && path.basename(scratch).startsWith("harness-commit-")) rmSync(scratch, { recursive: true });
  }
}
