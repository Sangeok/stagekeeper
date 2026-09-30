import { projectPath } from "@/fsd/shared/routes/project";

type HistoryLocation = {
  mode?: "items" | "events"; view?: "key" | "all"; before?: string | null; item?: string; itemBefore?: string;
};

export function historyHref(slug: string, location: HistoryLocation = {}): string {
  const query = new URLSearchParams();
  if (location.mode === "events") {
    query.set("mode", "events");
    if (location.view === "all") query.set("view", "all");
  }
  if (location.before) query.set("before", location.before);
  if (location.item) query.set("item", location.item);
  if (location.itemBefore) query.set("itemBefore", location.itemBefore);
  const base = projectPath(slug, "/history");
  return query.size === 0 ? base : `${base}?${query}`;
}
