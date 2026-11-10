import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../src/generated/prisma/client";
import type { DeploymentAudit } from "../../../src/server/templates/contracts";
import type { TemplateRow } from "../../../packages/core/templates/release-manifest.mjs";
import { validateTestDatabaseUrl } from "../../../scripts/lib/test-database.mjs";

export function releaseRows(body = "Do the work."): TemplateRow[] {
  const marker = "<!-- harness-runtime:harness-runtime-v1 -->";
  return [
    ...["CLAUDE.runbook.md", "CODEX.runbook.md"].map(path => ({ lang: "en", path, body: `${marker}\nRunbook\n` })),
    ...["docs/plans/README.md", "docs/plans/template.md", "docs/plans/verification-paths.md", "docs/agents/README.md"].map(path => ({ lang: "en", path, body: "Shared document\n" })),
    ...["dev", "pm", "feature-scout", "doc-auditor", "plan-verifier", "qa-verifier", "impl-verifier"].map(role => ({ lang: "en", path: `agents/${role}.md`, body: `${marker}\nStub\n## step:start\n${body}\nnext: done\n` })),
  ];
}

export const releaseAudit: DeploymentAudit = { actor: "test", environment: "test", targetProfileId: "isolated", targetIdentityHash: "a".repeat(64), codeSha: "b".repeat(40), workflowRun: "fixture" };

export async function withReleaseDatabase<T>(work: (clients: PrismaClient[]) => Promise<T>): Promise<T> {
  const connectionString = validateTestDatabaseUrl(process.env.TEST_DATABASE_URL);
  const schema = `template_release_${randomUUID().replaceAll("-", "")}`;
  const admin = new pg.Client({ connectionString });
  const clients: PrismaClient[] = [];
  await admin.connect();
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await admin.query(`SET search_path TO "${schema}"`);
    const migrations = resolve("prisma/migrations");
    for (const dir of readdirSync(migrations, { withFileTypes: true }).filter(dir => dir.isDirectory()).map(dir => dir.name).sort()) {
      await admin.query(readFileSync(resolve(migrations, dir, "migration.sql"), "utf8"));
    }
    for (let i = 0; i < 2; i++) clients.push(new PrismaClient({ adapter: new PrismaPg({ connectionString, options: `-c search_path=${schema}` }, { schema }) }));
    for (const client of clients) {
      const [namespace] = await client.$queryRaw<{ schema: string }[]>`SELECT current_schema() AS schema`;
      if (namespace.schema !== schema) throw new Error("Template test raw SQL escaped its schema");
    }
    return await work(clients);
  } finally {
    const closed = await Promise.allSettled(clients.map(client => client.$disconnect()));
    try { await admin.query(`DROP SCHEMA "${schema}" CASCADE`); } finally { await admin.end(); }
    const failures = closed.filter(result => result.status === "rejected");
    if (failures.length) throw new AggregateError(failures.map(result => result.reason), "Template fixture connections failed to close");
  }
}
