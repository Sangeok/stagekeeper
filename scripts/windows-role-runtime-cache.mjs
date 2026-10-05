import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { installedWindowsRuntime } from "../plugin/runtime/role-commands.mjs";

const builder = new URL("./build-windows-role-node.ps1", import.meta.url);
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const scriptDigest = file => digest(readFileSync(file, "utf8").replace(/\r\n/g, "\n"));
const buildArguments = ["release", "x64", "openssl-no-asm"];
const maximumFiles = 20000;
const maximumFileBytes = 128 * 1024 * 1024;
const maximumPackageBytes = 512 * 1024 * 1024;

export function windowsRuntimeCacheKey() {
  // App code and role helpers still receive fresh acceptance tests. Only the
  // Node build recipe and this cache verification contract invalidate the cache.
  const inputs = [builder, import.meta.url].map(file => scriptDigest(new URL(file)));
  return `windows-role-node-runtime-v2-windows-2022-x64-${digest(JSON.stringify(inputs))}`;
}

function regularPath(file) {
  const stat = lstatSync(file);
  const resolved = realpathSync(file);
  const expected = path.resolve(file);
  const samePath = process.platform === "win32" ? resolved.toLowerCase() === expected.toLowerCase() : resolved === expected;
  if (stat.isSymbolicLink() || !samePath || stat.isFile() && stat.nlink !== 1) throw new Error("Runtime cache alias refused");
  return stat;
}

export function verifyWindowsRuntimeCache(directory) {
  if (!path.isAbsolute(directory)) throw new Error("An absolute runtime cache directory is required");
  if (!regularPath(directory).isDirectory()) throw new Error("Runtime cache directory required");
  const manifestFile = path.join(directory, "provenance.json");
  const manifestStat = regularPath(manifestFile);
  if (!manifestStat.isFile() || manifestStat.size > 65536) throw new Error("Runtime cache provenance size or type unsupported");
  const runtime = installedWindowsRuntime(directory);
  const buildScriptSha256 = scriptDigest(builder);
  if (runtime.buildScriptSha256 !== buildScriptSha256) throw new Error("Runtime cache build recipe differs");
  if (runtime.source !== `https://nodejs.org/dist/v${runtime.version}/node-v${runtime.version}.tar.gz`
    || JSON.stringify(runtime.buildArguments) !== JSON.stringify(buildArguments)
    || !/^[a-f0-9]{64}$/.test(runtime.pipeSourceSha256 ?? "")) throw new Error("Runtime cache build provenance differs");

  const files = [];
  let bytes = 0, entries = 0;
  function visit(current, relative = "") {
    if (relative.split("/").length > 32) throw new Error("Runtime cache nesting unsupported");
    for (const name of readdirSync(current).sort()) {
      if (++entries > maximumFiles) throw new Error("Runtime cache entry count unsupported");
      const file = path.join(current, name), rel = path.posix.join(relative, name);
      const stat = regularPath(file);
      if (stat.isDirectory()) { visit(file, rel); continue; }
      if (!stat.isFile() || stat.size > maximumFileBytes || files.length >= maximumFiles
        || (bytes += stat.size) > maximumPackageBytes) throw new Error("Runtime cache package size or type unsupported");
      if (rel === "provenance.json") continue;
      const checksum = digest(readFileSync(file));
      if (rel === "node.exe" && checksum !== runtime.executableSha256) throw new Error("Runtime cache executable changed");
      files.push([rel, checksum]);
    }
  }
  // Hash with the runner's Node, before any cached executable is launched.
  visit(directory);
  for (const required of ["node.exe", "npm/bin/npm-cli.js", "LICENSE"]) {
    if (!files.some(([name]) => name === required)) throw new Error(`Runtime cache file missing: ${required}`);
  }
  if (digest(JSON.stringify(files)) !== runtime.packageSha256) throw new Error("Runtime cache package changed");
  return { key: windowsRuntimeCacheKey(), buildScriptSha256, executableSha256: runtime.executableSha256,
    packageSha256: runtime.packageSha256, files: files.length, bytes };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "key") console.log(windowsRuntimeCacheKey());
  else if (args.length === 3 && args[0] === "verify" && args[1] === "--runtime") {
    console.log(JSON.stringify(verifyWindowsRuntimeCache(args[2])));
  } else throw new Error("Expected key or verify --runtime <absolute directory>");
}
