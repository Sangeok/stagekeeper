import { parseQaReport } from "@harness/core/qa.mjs";
import type { Prisma, PrismaClient, Report } from "@/generated/prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;
export async function implementationReport(db: Db, boardItemId: string, agent: string, pipelineRunId: string): Promise<Report | null> {
  return db.report.findFirst({ where: { boardItemId, actor: agent, agentRun: { pipelineRunId, stepId: "report", closedAt: { not: null }, steps: { some: { stepId: "report", outcome: "ok", accepted: true } } } }, orderBy: { at: "desc" } });
}
export async function qaEntryResult(db: Db, projectId: string, boardItemId: string, agent: string, pipelineRunId: string, entryId: string): Promise<{ complete: boolean; failure: { note: string; path: string; commit: string } | null }> {
  const run = await db.agentRun.findFirst({ where: { projectId, agent: "qa-verifier", pipelineRunId, pipelineEntryId: entryId, closedAt: { not: null } }, orderBy: { openedAt: "desc" }, include: { reports: { where: { boardItemId }, orderBy: { at: "desc" }, take: 1 }, steps: { where: { accepted: true } } } });
  const report = run?.reports[0];
  if (!run || !report?.qa) return { complete: false, failure: null };
  let qa;
  try { qa = parseQaReport(report.qa); } catch { return { complete: false, failure: { note: "QA evidence is invalid; rerun verification.", path: report.path, commit: report.commit } }; }
  const target = await implementationReport(db, boardItemId, agent, pipelineRunId);
  const fresh = target !== null && target.commit === qa.targetCommit;
  const complete = fresh && qa.verdict === "pass" && run.stepId === "report" && run.steps.some(step => step.stepId === "verify" && step.outcome === "ok") && run.steps.some(step => step.stepId === "report" && step.outcome === "ok");
  return { complete, failure: complete ? null : { note: fresh ? `QA ${qa.verdict}. Review the report and fix the defect or test environment before explicitly retrying QA.` : "QA targets an earlier implementation commit; rerun verification.", path: report.path, commit: report.commit } };
}
