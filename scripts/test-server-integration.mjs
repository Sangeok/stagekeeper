import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { config } from "dotenv";
import { validateTestDatabase } from "./lib/test-database.mjs";

export function integrationCommands() {
  return [
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    ["--import", "./tests/server/register-server-only.mjs", "--import", "tsx", "--test", "--test-concurrency=1", "tests/server/integration/*.test.ts"],
  ];
}

export async function runIntegration(env = process.env, run = runChild) {
  const url = validateTestDatabase(env);
  const childEnv = { ...env, DATABASE_URL: url, TEST_DATABASE_URL: url };
  for (const args of integrationCommands()) await run(process.execPath, args, childEnv);
}

function runChild(command, args, env) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd: fileURLToPath(new URL("../", import.meta.url)), env, shell: false, stdio: args.includes("deploy") ? "ignore" : "inherit" });
    child.once("error", () => reject(new Error("Integration child could not start")));
    child.once("exit", (code) => code === 0 ? resolvePromise() : reject(new Error(`Integration ${args.includes("deploy") ? "migration" : "tests"} failed (exit ${code})`)));
  });
}

async function main() {
  const args = process.argv.slice(2);
  const usage = "Usage: npm run test:server:integration [-- --help] (run from the repository root with an isolated TEST_DATABASE_URL; applies migrations before tests)";
  if (args.length === 1 && args[0] === "--help") { console.log(usage); return; }
  if (args.length) { console.error(usage); process.exitCode = 2; return; }
  config({ quiet: true });
  await runIntegration();
  console.log("Server integration migration and tests passed.");
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
