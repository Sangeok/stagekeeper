import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export function codexExecutable(environment = process.env, platform = process.platform) {
  const search = Object.entries(environment).find(([name]) => name.toUpperCase() === "PATH")?.[1] ?? "";
  const skipped = [];
  for (const value of search.split(platform === "win32" ? ";" : ":")) {
    const directory = value.replace(/^"(.*)"$/, "$1");
    if (!path.isAbsolute(directory)) continue;
    for (const suffix of platform === "win32" ? [".exe", ".cmd"] : [""]) {
      const candidate = path.join(directory, "codex" + suffix);
      if (!existsSync(candidate)) continue;
      let executable = candidate, prefix = [];
      if (suffix === ".cmd") {
        const packageRoot = path.join(directory, "node_modules/@openai/codex"), entry = path.join(packageRoot, "bin/codex.js");
        try {
          const manifest = JSON.parse(readFileSync(path.join(packageRoot, "package.json"), "utf8"));
          if (manifest.name !== "@openai/codex" || manifest.bin?.codex !== "bin/codex.js" || !existsSync(entry)
            || !readFileSync(candidate, "utf8").includes("node_modules\\@openai\\codex\\bin\\codex.js")) throw new Error("Unsupported wrapper");
        } catch { skipped.push({ path: candidate, reason: "unsupported-wrapper" }); continue; }
        executable = process.execPath; prefix = [entry];
      }
      try {
        const version = execFileSync(executable, [...prefix, "--version"], { windowsHide: true, encoding: "utf8", timeout: 10000, maxBuffer: 16384, stdio: ["ignore", "pipe", "pipe"] }).trim();
        if (!/^codex-cli \d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(version)) throw new Error("Invalid CLI identity");
        return { executable, prefix, source: candidate, version, skipped };
      } catch { skipped.push({ path: candidate, reason: "cli-check-failed" }); }
    }
  }
  throw new Error("No supported Codex CLI found on PATH");
}
