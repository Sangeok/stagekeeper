import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

function main() {
  const args = process.argv.slice(2);
  const usage = "Usage: npm run build [-- --help] (run from the repository root; generates Prisma Client, then builds Next.js)";
  if (args.length === 1 && args[0] === "--help") { console.log(usage); return; }
  if (args.length) { console.error(usage); process.exitCode = 2; return; }

  const require = createRequire(import.meta.url);
  const windowsRole = process.platform === "win32" && process.env.STAGEKEEPER_ROLE_SNAPSHOT === "1";
  const steps = [
    [require.resolve("prisma/build/index.js"), "generate"],
    [require.resolve("next/dist/bin/next"), "build", ...(windowsRole ? ["--webpack"] : [])],
  ];
  const env = { ...process.env };
  if (windowsRole) {
    const preload = fileURLToPath(new URL("./windows/windows-role-readlink.cjs", import.meta.url));
    env.NODE_OPTIONS = `${env.NODE_OPTIONS ?? ""} --require ${JSON.stringify(preload)}`.trim();
  }
  for (const command of steps) {
    const child = spawnSync(process.execPath, command, { env, stdio: "inherit", windowsHide: true });
    if (child.error) throw child.error;
    if (child.status !== 0) { process.exitCode = child.status ?? 1; return; }
  }
}

main();
