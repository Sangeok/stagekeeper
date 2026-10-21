import { blobHref, orderReportActors, reportDocLabel, reportIsAcceptance, type RepoRef } from "@/fsd/entities/board-item";
import type { ItemDoc } from "../ui/board-item-page";

type ReportRow = { id: string; actor: string; path: string; commit: string; at: Date; isAcceptance?: boolean | null };
type DocSource = { planPath: string | null; planCommit: string | null; acceptedAt: Date | null; reports: readonly ReportRow[] };

export function toItemDocs(row: DocSource, repo: RepoRef): ItemDoc[] {
  const docs: ItemDoc[] = [];
  if (row.planPath !== null) {
    docs.push({ id: "plan", label: "Plan", path: row.planPath, href: blobHref(repo, row.planPath, row.planCommit) });
  }

  const byActor = new Map<string, ReportRow[]>();
  for (const report of row.reports) {
    const seen = byActor.get(report.actor);
    if (seen === undefined) byActor.set(report.actor, [report]);
    else seen.push(report);
  }
  for (const actor of orderReportActors(new Set(byActor.keys()))) {
    for (const report of byActor.get(actor) ?? []) {
      const isAcceptance = reportIsAcceptance(report, row.acceptedAt);
      docs.push({ id: `report:${report.id}`, label: reportDocLabel(actor, isAcceptance), path: report.path, href: blobHref(repo, report.path, report.commit) });
    }
  }
  return docs;
}
