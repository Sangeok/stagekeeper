import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MACOS_NODE_VERSION = "22.23.3";
export const MACOS_NODE_ARCHIVES = Object.freeze({
  arm64: "23b25245dcfb9af7262f8ff142e9e2e0af025368117329e7a7458a51e5922f53",
  x64: "8a677b0219178efd6eb0e475457c4afb452b521a92f6e67845a73bd85727f2a8",
});
export const macosDigest = bytes => createHash("sha256").update(bytes).digest("hex");

export function macosRuntimeInventory(directory) {
  const rows = []; let bytes = 0;
  function visit(current, relative = "", depth = 0) {
    if (depth > 32) throw new Error("macOS runtime directory depth exceeded");
    for (const name of readdirSync(current).sort()) {
      if (!relative && name === "provenance.json") continue;
      const full = path.join(current, name), rel = path.join(relative, name), stat = lstatSync(full);
      if (stat.isSymbolicLink() || !stat.isDirectory() && (!stat.isFile() || stat.nlink !== 1)) throw new Error("macOS runtime alias or file type refused");
      if (stat.isDirectory()) visit(full, rel, depth + 1);
      else {
        if (stat.size > 128 * 1024 * 1024 || (bytes += stat.size) > 512 * 1024 * 1024 || rows.length >= 20000) throw new Error("macOS runtime package size exceeded");
        rows.push([rel.split(path.sep).join("/"), macosDigest(readFileSync(full)), stat.mode & 0o777]);
      }
    }
  }
  if (lstatSync(directory).isSymbolicLink()) throw new Error("macOS runtime directory alias refused");
  visit(directory);
  return rows;
}

export function installedMacosRuntime(directory = fileURLToPath(new URL("./macos/node/", import.meta.url))) {
  if (!path.isAbsolute(directory)) throw new Error("Absolute macOS runtime directory required");
  const root = realpathSync(directory), provenance = path.join(root, "provenance.json"), stat = lstatSync(provenance);
  if (lstatSync(directory).isSymbolicLink() || !stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 16384) throw new Error("macOS runtime provenance file refused");
  const manifest = JSON.parse(readFileSync(provenance, "utf8"));
  if (!manifest || Array.isArray(manifest) || manifest.format !== "stagekeeper-macos-node-v1" || manifest.version !== MACOS_NODE_VERSION
    || !Object.hasOwn(MACOS_NODE_ARCHIVES, manifest.architecture) || manifest.architecture !== process.arch
    || manifest.sourceSha256 !== MACOS_NODE_ARCHIVES[manifest.architecture]) throw new Error("macOS runtime provenance differs");
  const rows = macosRuntimeInventory(root);
  const files = new Set(rows.map(row => row[0]));
  for (const required of ["bin/node", "bin/npm", "bin/npx", "npm/bin/npm-cli.js", "LICENSE", "sandbox-identity", "node.sha256"]) if (!files.has(required)) throw new Error("macOS runtime package is incomplete");
  for (const executable of ["bin/node", "bin/npm", "bin/npx", "sandbox-identity"]) if ((lstatSync(path.join(root, executable)).mode & 0o111) === 0) throw new Error("macOS runtime executable mode differs");
  if (macosDigest(JSON.stringify(rows)) !== manifest.packageSha256
    || macosDigest(readFileSync(path.join(root, "bin/node"))) !== manifest.executableSha256
    || macosDigest(readFileSync(path.join(root, "sandbox-identity"))) !== manifest.scannerSha256
    || macosDigest(readFileSync(new URL("./macos/sandbox-identity.c", import.meta.url))) !== manifest.scannerSourceSha256) throw new Error("macOS runtime package changed");
  return Object.freeze({ ...manifest, directory: root });
}
