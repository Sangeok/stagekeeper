export type RepoRef = { owner: string; repo: string; branch: string };

function encodePathSegments(value: string): string {
  return value.split("/").map(encodeURIComponent).join("/");
}

export function blobHref(repo: RepoRef, path: string, ref: string | null = null): string {
  return `https://github.com/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/blob/${encodePathSegments(ref ?? repo.branch)}/${encodePathSegments(path)}`;
}

export const DOC_LINK_NOTE = "Opens the recorded commit on GitHub. If it 404s, that commit is not pushed yet.";

const REPORT_LABEL = new Map([
  ["main-loop", "Validation record"],
  ["doc-auditor", "Audit report"],
  ["feature-scout", "Scouting report"],
]);
const DEV_REPORT_LABEL = "Implementation report";
const ACCEPTANCE_LABEL = "Acceptance record";

export function reportIsAcceptance(report: { at: Date; isAcceptance?: boolean | null }, acceptedAt: Date | null): boolean {
  return report.isAcceptance ?? (acceptedAt !== null && report.at.getTime() >= acceptedAt.getTime());
}

export function reportDocLabel(actor: string, isAcceptance = false): string {
  if (actor === "main-loop" && isAcceptance) return ACCEPTANCE_LABEL;
  return REPORT_LABEL.get(actor) ?? DEV_REPORT_LABEL;
}

export function orderReportActors(actors: ReadonlySet<string>): string[] {
  const rest = [...actors]
    .filter((a) => !REPORT_LABEL.has(a))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return ["main-loop", ...rest, "doc-auditor", "feature-scout"].filter((a) => actors.has(a));
}
