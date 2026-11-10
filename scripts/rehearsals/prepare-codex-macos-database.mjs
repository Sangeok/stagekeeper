import { execFileSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { validateTestDatabase } from "../lib/test-database.mjs";

async function main() {
  const [flag, directory, ...extra] = process.argv.slice(2);
  if (flag !== "--data-directory" || !directory || !path.isAbsolute(directory) || extra.length) throw new Error("Use --data-directory with the owned macOS test cluster");
  const expected = realpathSync(directory);
  if (!/^stagekeeper-macos-pgdata-/.test(path.basename(expected)) || !existsSync(path.join(expected, "postmaster.pid"))) throw new Error("An owned running macOS acceptance cluster is required");
  const target = validateTestDatabase(process.env), url = new URL(target), database = decodeURIComponent(url.pathname.slice(1));
  if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.search || !/^stagekeeper_test_[A-Za-z0-9_]+$/.test(database)) throw new Error("Only a plain loopback test database is allowed");
  url.pathname = "/postgres";
  const client = new pg.Client({ connectionString: url.href });
  try {
    await client.connect();
    const observed = await client.query("SHOW data_directory");
    if (observed.rows[0].data_directory !== expected) throw new Error("Connected PostgreSQL cluster differs from the owned data directory");
    if ((await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [database])).rowCount) throw new Error("The test database already exists; choose a new name");
    await client.query(`CREATE DATABASE "${database}"`);
  } finally { await client.end(); }
  const root = fileURLToPath(new URL("../../", import.meta.url));
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { cwd: root, env: { ...process.env, DATABASE_URL: target }, stdio: "pipe" });
  console.log(JSON.stringify({ database, migrated: true, existingDataChanged: false }));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
