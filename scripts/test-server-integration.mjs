import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { config } from "dotenv";

function identity(value) {
  const url = new URL(value);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("PostgreSQL URL required");
  const database = decodeURIComponent(url.pathname.slice(1));
  const host = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname.toLowerCase()) ? "loopback" : url.hostname.toLowerCase();
  return { database, key: `${host}:${url.port || "5432"}/${database}` };
}

export function validateTestDatabase(env) {
  try {
    const test = identity(env.TEST_DATABASE_URL);
    if (!/^stagekeeper_test_[a-zA-Z0-9_-]+$/.test(test.database)) throw new Error();
    if (env.DATABASE_URL && identity(env.DATABASE_URL).key === test.key) throw new Error();
    return env.TEST_DATABASE_URL;
  } catch {
    throw new Error("Set TEST_DATABASE_URL to a PostgreSQL stagekeeper_test_* database distinct from DATABASE_URL (host, port, database).");
  }
}

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
    // Child output can contain a connection string. Report only the failing phase.
    const child = spawn(command, args, { cwd: fileURLToPath(new URL("../", import.meta.url)), env, shell: false, stdio: "ignore" });
    child.once("error", () => reject(new Error("Integration child could not start")));
    child.once("exit", (code) => code === 0 ? resolvePromise() : reject(new Error(`Integration ${args.includes("deploy") ? "migration" : "tests"} failed (exit ${code})`)));
  });
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  config({ quiet: true });
  runIntegration().then(() => console.log("Server integration migration and tests passed."), (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
