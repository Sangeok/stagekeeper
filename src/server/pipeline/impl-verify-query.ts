import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { implementationReport } from "./qa-query";

type Db = PrismaClient | Prisma.TransactionClient;
export const IMPL_VERIFIER = "impl-verifier";
export const IMPL_VERIFY_PENDING = "Implementation verification has not completed; acceptance is only available at accept";
export const implVerifierReportPath = (key: string) => `docs/agents/${IMPL_VERIFIER}/${key}.md`;

// impl-verify 노드의 증거. 현재 entry에서 마지막으로 닫힌 impl-verifier run과 그 run에 묶인 보고로 판정한다.
// 판정은 run이 끝난 단계가 정한다 — report(verify/ok 뒤)·failed-report·blocked-report. 구현이 다시 열리면 새 entry가 생겨
// 옛 run은 여기서 보이지 않는다(qa-query.ts와 같은 entry 결합). 구조화 값이 없으므로 마이그레이션도 없다.
export async function implVerifyEntryResult(db: Db, projectId: string, boardItemId: string, agent: string, pipelineRunId: string, entryId: string): Promise<{ complete: boolean; failure: { note: string; path: string; commit: string } | null }> {
  const run = await db.agentRun.findFirst({ where: { projectId, agent: IMPL_VERIFIER, pipelineRunId, pipelineEntryId: entryId, closedAt: { not: null } }, orderBy: { openedAt: "desc" }, include: { reports: { where: { boardItemId }, orderBy: { at: "desc" }, take: 1 }, steps: { where: { accepted: true } } } });
  const report = run?.reports[0];
  if (!run || !report) return { complete: false, failure: null };
  const target = await implementationReport(db, boardItemId, agent, pipelineRunId);
  const passed = target !== null && run.stepId === "report"
    && run.steps.some(step => step.stepId === "verify" && step.outcome === "ok")
    && run.steps.some(step => step.stepId === "report" && step.outcome === "ok");
  if (passed) return { complete: true, failure: null };
  const what = run.stepId === "failed-report" ? "found defects that break the implementation" : run.stepId === "blocked-report" ? "could not run a required check" : "did not complete its report";
  return { complete: false, failure: { note: `impl-verifier ${what}. Read the report, then reopen implementation or explicitly retry.`, path: report.path, commit: report.commit } };
}
