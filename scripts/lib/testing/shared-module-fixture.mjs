import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export function writeModule(root, file, source = "export const value = 1;\n") {
  const target = join(root, file);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, source);
}

export function writeExports(root, entries) {
  writeModule(root, "packages/shared/plugin-exports.json", JSON.stringify({ version: 1, entries }) + "\n");
}

export function moduleProject(t, entries = [{ path: "config.mjs", runtime: "universal" }]) {
  const root = mkdtempSync(join(realpathSync.native(tmpdir()), "stagekeeper-shared-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeExports(root, entries);
  for (const entry of entries) writeModule(root, "packages/shared/" + entry.path);
  return root;
}

export function treeSnapshot(root) {
  if (!existsSync(root)) return null;
  const files = [];
  function visit(file, relative) {
    const stat = lstatSync(file, { bigint: true });
    if (stat.isSymbolicLink()) files.push([relative, "link", readlinkSync(file)]);
    else if (stat.isDirectory()) {
      files.push([relative, "directory", stat.mtimeNs.toString()]);
      for (const name of readdirSync(file).sort()) visit(join(file, name), relative ? relative + "/" + name : name);
    }
    else files.push([relative, createHash("sha256").update(readFileSync(file)).digest("hex"), stat.mtimeNs.toString()]);
  }
  visit(root, "");
  return files;
}
