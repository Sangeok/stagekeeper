import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createVerificationGit } from "./role-git.mjs";
import { snapshotRepository } from "./role-commands.mjs";
import { RoleFileInputError } from "./role-files.mjs";

const protectedPath = name => name.split("/").some(part => [".git", ".codex", ".claude", ".ssh", ".aws", ".npmrc", ".netrc", ".git-credentials"].includes(part.toLowerCase())
  || /^\.env(?:$|\.)/i.test(part) && part.toLowerCase() !== ".env.example");
const pathsFrom = bytes => bytes.toString("utf8").split("\0").filter(Boolean);
const hash = bytes => createHash("sha256").update(bytes).digest("hex");

export const implementationGitTool = {
  name: "implementation_git",
  description: "Use the disposable implementation verification copy's Git evidence. identity returns resolved HEAD/target/approved-plan commits and ancestry. changes compares approved plan to implementation. show reads one file at target or plan. history reads that file's plan-to-target commits. restore replaces only explicit copy files from target or plan, deleting files absent at that ref. status reports copy differences from target. No owner checkout writes, config, hooks, remotes, commit or push. Use this tool instead of shell git commands.",
  inputSchema: { type: "object", properties: { operation: { enum: ["identity", "changes", "show", "history", "restore", "status"] },
    ref: { enum: ["plan", "target"] }, paths: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 100 } }, required: ["operation"], additionalProperties: false },
};

export async function prepareImplementationCopy({ root, targetCommit, planCommit, fileBroker, lifecycle, signal }) {
  signal ??= new AbortController().signal;
  if (!/^[a-f0-9]{40}$/.test(targetCommit ?? "") || !/^[a-f0-9]{40}$/.test(planCommit ?? "")) throw new Error("Implementation verification requires resolved target and approved plan commits");
  const directory = await mkdtemp(path.join(realpathSync(tmpdir()), "harness-impl-verify-")), copy = path.join(directory, "repo");
  let completed = false;
  try {
    const snapshot = await snapshotRepository(root, copy, fileBroker, signal, { internalSymlinks: process.platform === "darwin" });
    const git = await createVerificationGit(root, directory, targetCommit, lifecycle, signal);
    await git.query(["merge-base", "--is-ancestor", planCommit, targetCommit]);
    const committedTree = pathsFrom(await git.query(["ls-tree", "-rz", "--full-tree", targetCommit])).map(row => {
      const match = /^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/.exec(row);
      if (!match) throw new Error("Verification copy requires regular committed files; submodules and committed symlinks are unsupported");
      const name = match[3];
      if (path.isAbsolute(name) || name.split("/").some(part => part === "." || part === "..") || /[\0\r\n]/.test(name)) throw new Error("Verification Git path refused");
      return { path: name, mode: match[1] };
    });
    const tree = committedTree.filter(row => !protectedPath(row.path));
    const omitted = [...new Set([...snapshot.omitted, ...committedTree.filter(row => protectedPath(row.path)).map(row => row.path)])];
    await git.query(["read-tree", targetCommit]);
    for (let index = 0; index < tree.length; index += 100) await git.query(["checkout-index", "--force", "--", ...tree.slice(index, index + 100).map(row => row.path)]);
    let closed = false;
    const relativePaths = args => {
      if (!Array.isArray(args.paths) || args.paths.length === 0 || args.paths.length > 100) throw new RoleFileInputError("Supply explicit copy-relative file paths.");
      return args.paths.map(name => {
        if (typeof name !== "string" || !name || path.isAbsolute(name) || /[\\\x00-\x1f]/.test(name) || name.split("/").some(part => !part || part === "." || part === "..") || protectedPath(name)) throw new RoleFileInputError("Use copy-relative regular files, excluding credentials and Git metadata.");
        const target = path.join(copy, name); let current = copy;
        for (const part of name.split("/")) {
          current = path.join(current, part);
          if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw new Error("Verification copy alias refused");
        }
        if (existsSync(target) && !lstatSync(target).isFile()) throw new Error("Verification copy requires a regular file");
        return name;
      });
    };
    completed = true;
    return { directory, copy, targetCommit, planCommit, snapshot, omitted,
      async call(args) {
        if (closed || !args || Array.isArray(args) || Object.keys(args).some(key => !["operation", "ref", "paths"].includes(key))) throw new RoleFileInputError("Use operation with optional ref and paths.");
        signal?.throwIfAborted(); await lifecycle.beforeActivate?.();
        const operation = args.operation;
        if (!["identity", "changes", "show", "history", "restore", "status"].includes(operation)) throw new RoleFileInputError("Unknown implementation Git operation.");
        if (args.ref != null && !["plan", "target"].includes(args.ref)) throw new RoleFileInputError("ref must be plan or target.");
        const ref = args.ref === "plan" ? planCommit : targetCommit;
        if (operation === "identity") return { head: targetCommit, targetCommit, planCommit, planIsAncestor: true, copy, omitted, scope: "permitted-files" };
        if (operation === "changes") return { output: (await git.query(["diff", "--name-status", "--no-renames", "--no-ext-diff", planCommit, targetCommit])).toString("utf8") };
        if (operation === "status") {
          const chunks = [];
          for (let index = 0; index < tree.length; index += 100) chunks.push(await git.query(["diff", "--name-status", "--no-renames", "--no-ext-diff", "--no-textconv", targetCommit, "--", ...tree.slice(index, index + 100).map(row => row.path)]));
          return { output: Buffer.concat(chunks).toString("utf8"), omitted, scope: "permitted-files" };
        }
        const names = relativePaths(args);
        if (["show", "history"].includes(operation) && names.length !== 1) throw new RoleFileInputError("show and history require exactly one file.");
        if (operation === "history") return { output: (await git.query(["log", "--oneline", `${planCommit}..${targetCommit}`, "--", names[0]])).toString("utf8") };
        if (operation === "show") return { ref, path: names[0], text: (await git.query(["cat-file", "blob", `${ref}:${names[0]}`])).toString("utf8") };
        const changed = [];
        for (const name of names) {
          const target = path.join(copy, name), before = existsSync(target) ? hash(readFileSync(target)) : null;
          const entries = pathsFrom(await git.query(["ls-tree", "-z", ref, "--", name]));
          if (!entries.length) { if (existsSync(target)) await rm(target); changed.push({ path: name, before, after: null }); continue; }
          if (entries.length !== 1 || !/^(100644|100755) blob [a-f0-9]{40}\t/.test(entries[0])) throw new Error("Verification restore requires one regular historical file");
          const bytes = await git.query(["cat-file", "blob", `${ref}:${name}`]);
          await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, bytes);
          await chmod(target, entries[0].startsWith("100755") ? 0o700 : 0o600);
          changed.push({ path: name, before, after: hash(bytes) });
        }
        return { ref, changed, originalRepositoryWrites: false };
      },
      async close() { if (closed) return; closed = true; await rm(directory, { recursive: true }); },
    };
  } finally { if (!completed) await rm(directory, { recursive: true }); }
}
