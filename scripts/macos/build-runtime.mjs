import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MACOS_NODE_ARCHIVES, MACOS_NODE_VERSION, installedMacosRuntime, macosDigest, macosRuntimeInventory } from "../../plugin/runtime/macos-runtime.mjs";

export function buildMacosRuntime({ archive, output, architecture = process.arch }) {
  if (process.platform !== "darwin" || architecture !== process.arch || !Object.hasOwn(MACOS_NODE_ARCHIVES, architecture)) throw new Error("Build the runtime on its target macOS architecture");
  if (!path.isAbsolute(output) || existsSync(output)) throw new Error("A new absolute runtime output directory is required");
  if (macosDigest(readFileSync(archive)) !== MACOS_NODE_ARCHIVES[architecture]) throw new Error("Official Node archive checksum differs");
  const temporary = mkdtempSync(path.join(realpathSync(tmpdir()), "stagekeeper-runtime-build-"));
  try {
    execFileSync("/usr/bin/tar", ["-xzf", archive, "-C", temporary], { stdio: "pipe" });
    const source = path.join(temporary, `node-v${MACOS_NODE_VERSION}-darwin-${architecture}`);
    mkdirSync(path.join(output, "bin"), { recursive: true });
    copyFileSync(path.join(source, "bin/node"), path.join(output, "bin/node"));
    chmodSync(path.join(output, "bin/node"), 0o755);
    cpSync(path.join(source, "lib/node_modules/npm"), path.join(output, "npm"), { recursive: true, dereference: true });
    copyFileSync(path.join(source, "LICENSE"), path.join(output, "LICENSE"));
    for (const name of ["npm", "npx"]) writeFileSync(path.join(output, "bin", name), `#!/bin/sh\nexec "$(dirname "$0")/node" "$(dirname "$0")/../npm/bin/${name}-cli.js" "$@"\n`, { mode: 0o755 });
    const scanner = fileURLToPath(new URL("../../plugin/runtime/macos/sandbox-identity.c", import.meta.url));
    execFileSync("/usr/bin/xcrun", ["clang", "-std=c11", "-Wall", "-Wextra", "-Werror", "-O2", scanner, "-o", path.join(output, "sandbox-identity")], { stdio: "pipe" });
    writeFileSync(path.join(output, "node.sha256"), `${macosDigest(readFileSync(path.join(output, "bin/node")))}  bin/node\n`, { flag: "wx" });
    const manifest = { format: "stagekeeper-macos-node-v1", version: MACOS_NODE_VERSION, architecture,
      sourceSha256: MACOS_NODE_ARCHIVES[architecture], executableSha256: macosDigest(readFileSync(path.join(output, "bin/node"))),
      scannerSourceSha256: macosDigest(readFileSync(scanner)), scannerSha256: macosDigest(readFileSync(path.join(output, "sandbox-identity"))),
      packageSha256: macosDigest(JSON.stringify(macosRuntimeInventory(output))) };
    writeFileSync(path.join(output, "provenance.json"), JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" });
    return installedMacosRuntime(output);
  } finally { rmSync(temporary, { recursive: true }); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), values = {};
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    if (!["--archive", "--output"].includes(name) || !args[index + 1] || Object.hasOwn(values, name)) throw new Error("Expected --archive and --output");
    values[name] = args[index + 1];
  }
  if (!values["--archive"] || !values["--output"]) throw new Error("Archive and output are required");
  console.log(JSON.stringify(buildMacosRuntime({ archive: values["--archive"], output: values["--output"] })));
}
