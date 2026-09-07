// 항목 상세가 보여줄 문서 목록. 라벨과 순서는 entities/board-item 하나가 소유한다 —
// 예전에는 라우트가 "Plan"·"<actor> report"를 직접 지어서, 라벨 주인이 "Validation record"라
// 부르는 문서를 화면은 "main-loop report"라 부르고 정렬도 없었다.
import { blobHref, orderReportActors, reportDocLabel, type RepoRef } from "@/fsd/entities/board-item";
import type { ItemDoc } from "../ui/board-item-page";

type ReportRow = { actor: string; path: string; commit: string; at: Date };
type DocSource = { planPath: string | null; planCommit: string | null; acceptedAt: Date | null; reports: readonly ReportRow[] };

export function toItemDocs(row: DocSource, repo: RepoRef): ItemDoc[] {
  const docs: ItemDoc[] = [];
  if (row.planPath !== null) {
    // 게이트②가 승인하는 것은 기록된 커밋이다 — 링크도 그 커밋을 연다.
    docs.push({ label: "Plan", path: row.planPath, href: blobHref(repo, row.planPath, row.planCommit) });
  }

  // 한 행위자가 여러 번 보고할 수 있다 — 묶되 버리지 않는다.
  const byActor = new Map<string, ReportRow[]>();
  for (const report of row.reports) {
    const seen = byActor.get(report.actor);
    if (seen === undefined) byActor.set(report.actor, [report]);
    else seen.push(report);
  }
  for (const actor of orderReportActors(new Set(byActor.keys()))) {
    for (const report of byActor.get(actor) ?? []) {
      // main-loop의 보고는 둘이다: in_review의 검증 라운드 기록과 done의 인수 기록. acceptedAt 이후의 것이 인수 기록이다.
      const isAcceptance = row.acceptedAt !== null && report.at.getTime() >= row.acceptedAt.getTime();
      docs.push({ label: reportDocLabel(actor, isAcceptance), path: report.path, href: blobHref(repo, report.path, report.commit) });
    }
  }
  return docs;
}
