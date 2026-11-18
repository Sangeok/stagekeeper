import { writeFileSync } from "node:fs";
import path from "node:path";
import type { Run } from "./command-run";
import { repositoryRoot as REPO } from "./repository-root.mjs";

export function seedTemplates(run: Run, templates: string, snapshot: string, childEnv: NodeJS.ProcessEnv): string {
  const output = run.succeed(process.execPath, ["--import", "tsx", "scripts/templates/seed-templates.ts", "--dir", templates, "--snapshot", snapshot], REPO, childEnv, "seed:templates", 300_000).stdout;
  const revision = /done: \d+ templates atomically seeded from ([0-9a-f]{40})/.exec(output)?.[1];
  if (!revision) throw new Error("seed:templates did not report a template revision");
  return revision;
}

export async function bootstrapSmokeTemplates(input: { databaseUrl: string; run: Run; work: string; codeSha: string; requestId: string; workflowRun: string }): Promise<void> {
  await input.run.step("template-cutover", async () => {
    const { withPrisma } = await import("../../lib/prisma");
    const { snapshotTemplateCutover, bootstrapTemplateReleases } = await import("../../../src/server/templates/api");
    await withPrisma(async db => {
      const snapshot = await snapshotTemplateCutover(db);
      writeFileSync(path.join(input.work, "private-cutover-snapshot.json"), JSON.stringify(snapshot), { flag: "wx", mode: 0o600 });
      const audit = { actor: "client-smoke", environment: "test", targetProfileId: "isolated-smoke", targetIdentityHash: "0".repeat(64), codeSha: input.codeSha, workflowRun: input.workflowRun };
      const result = await bootstrapTemplateReleases(db, { requestId: input.requestId, audit, evidence: {
        schemaVersion: 1, snapshotHash: snapshot.hash, codeSha: audit.codeSha, targetIdentityHash: audit.targetIdentityHash,
        maintenanceReference: "isolated smoke before any role RPC writers", writersDrained: true,
        readers: [{ identity: "isolated-next-server", codeSha: audit.codeSha, protocol: "template-release-v1" }],
        inventory: snapshot.data.templates.map(({ lang, path }) => ({ lang, path })), excluded: [], unboundRuns: [],
      } });
      if (!result.ok) throw new Error("Smoke template bootstrap refused");
    }, input.databaseUrl);
  });
}
