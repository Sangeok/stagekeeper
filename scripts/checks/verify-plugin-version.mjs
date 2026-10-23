import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isShippedPluginFile } from "../windows/package-windows-plugin.mjs";

export const pluginManifests = ["plugin/.claude-plugin/plugin.json", "plugin/.codex-plugin/plugin.json"];
const repository = fileURLToPath(new URL("../../", import.meta.url));
const parts = version => typeof version === "string" && /^\d+\.\d+\.\d+$/.test(version) ? version.split(".").map(Number) : null;
const isNewer = (next, previous) => {
  for (let i = 0; i < 3; i++) if (next[i] !== previous[i]) return next[i] > previous[i];
  return false;
};

export function inspectPluginVersion({ changed, base, head }) {
  const shipped = changed.filter(isShippedPluginFile);
  if ([...base, ...head].some(version => !parts(version))) return { shipped, problems: ["Every plugin manifest needs an x.y.z version"] };
  const problems = [];
  if (new Set(head).size !== 1) problems.push(`Plugin manifest versions differ: ${pluginManifests.map((file, i) => `${file} ${head[i]}`).join(", ")}`);
  if (shipped.length && !head.every((version, i) => isNewer(parts(version), parts(base[i])))) problems.push(`Shipped plugin files changed, but the plugin version did not rise above ${[...new Set(base)].join(" / ")}`);
  return { shipped, problems };
}

export function readPluginRelease(root, baseRef, headRef) {
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const versions = ref => pluginManifests.map(file => JSON.parse(git("show", `${ref}:${file}`)).version);
  const changed = git("diff", "--name-only", baseRef, headRef, "--", "plugin").split(/\r?\n/).filter(Boolean);
  return { changed, base: versions(baseRef), head: versions(headRef) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2), refs = { "--base": "origin/main", "--head": "origin/dev" };
    for (let i = 0; i < args.length; i += 2) {
      if (!Object.hasOwn(refs, args[i]) || !args[i + 1]) throw new Error("Usage: verify:plugin-version [--base <ref>] [--head <ref>]");
      refs[args[i]] = args[i + 1];
    }
    execFileSync("git", ["fetch", "--quiet", "origin", "main", "dev"], { cwd: repository, stdio: "ignore" });
    const release = readPluginRelease(repository, refs["--base"], refs["--head"]), result = inspectPluginVersion(release);
    if (result.problems.length) {
      for (const problem of result.problems) console.error(problem);
      for (const file of result.shipped) console.error(`  ${file}`);
      process.exitCode = 1;
    } else console.log(result.shipped.length ? `Plugin version check passed: ${release.base[0]} -> ${release.head[0]} for ${result.shipped.length} shipped files.` : "Plugin version check passed: no shipped plugin file changed.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Plugin version check failed");
    process.exitCode = 1;
  }
}
