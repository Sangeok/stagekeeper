import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const windowsRole = process.platform === "win32" && process.env.STAGEKEEPER_ROLE_SNAPSHOT === "1";
const steps = [
  [require.resolve("prisma/build/index.js"), "generate"],
  [require.resolve("next/dist/bin/next"), "build", ...(windowsRole ? ["--webpack"] : [])],
];
const env = { ...process.env };
if (windowsRole) {
  const preload = fileURLToPath(new URL("./windows-role-readlink.cjs", import.meta.url));
  // The launcher provides a clean environment. Retain any caller's other Node
  // options and preload this compatibility layer in build workers as well.
  env.NODE_OPTIONS = `${env.NODE_OPTIONS ?? ""} --require ${JSON.stringify(preload)}`.trim();
}
for (const args of steps) {
  const child = spawnSync(process.execPath, args, { env, stdio: "inherit", windowsHide: true });
  if (child.error) throw child.error;
  if (child.status !== 0) process.exit(child.status ?? 1);
}
