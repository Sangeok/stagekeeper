import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function inventory(root) {
  const base = fs.lstatSync(root, { bigint: true });
  if (!base.isDirectory() || base.isSymbolicLink()) throw new Error("invalid-directory");
  const entries = []; let bytes = 0;
  function walk(directory, prefix = "") {
    for (const raw of fs.readdirSync(directory, { encoding: "buffer" })) {
      const name = new TextDecoder("utf-8", { fatal: true }).decode(raw);
      const relative = prefix ? prefix + "/" + name : name;
      if (relative === ".git") continue;
      if (name === ".git") throw new Error("nested-repository");
      const file = path.join(directory, name), s = fs.lstatSync(file, { bigint: true });
      const type = s.isSymbolicLink() ? "link" : s.isDirectory() ? "directory" : s.isFile() ? "file" : "other";
      if (type === "other") throw new Error("unsupported-file-type");
      if (s.dev !== base.dev) throw new Error("foreign-filesystem");
      const entry = { path: relative, type, device: String(s.dev), inode: String(s.ino), mode: String(s.mode), size: String(s.size),
        modified: String(s.mtimeNs), changed: String(s.ctimeNs), link: null, target: null };
      if (type === "link") { entry.link = fs.readlinkSync(file); entry.target = fs.realpathSync.native(file); }
      entries.push(entry); bytes += Buffer.byteLength(JSON.stringify(entry));
      if (entries.length > 200000 || bytes > 32 * 1024 * 1024) throw new Error("inventory-limit");
      if (type === "directory") walk(file, relative);
    }
  }
  walk(root); entries.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const again = fs.lstatSync(root, { bigint: true });
  if (base.dev !== again.dev || base.ino !== again.ino) throw new Error("identity-changed");
  return { identity: { path: fs.realpathSync.native(root), device: String(base.dev), inode: String(base.ino) }, entries };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3 || !path.isAbsolute(process.argv[2])) throw new Error("invalid-input");
    process.stdout.write(JSON.stringify(inventory(process.argv[2])) + "\n");
  } catch (e) {
    const allowed = ["invalid-input", "invalid-directory", "nested-repository", "unsupported-file-type", "foreign-filesystem", "inventory-limit", "identity-changed"];
    process.stdout.write(JSON.stringify({ error: allowed.includes(e.message) ? e.message : "inventory-unverified" }) + "\n");
  }
}
