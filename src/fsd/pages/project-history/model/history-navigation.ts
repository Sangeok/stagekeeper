import { projectPath } from "@/fsd/shared/routes/project";

type HistoryLocation = {
  mode?: "items" | "events"; view?: "key" | "all"; before?: string | null; item?: string; itemBefore?: string;
};

type QueryValue = string | string[] | undefined;
export type HistoryQuery = {
  mode: "items" | "events";
  view: "key" | "all";
  before: string | undefined;
  item: string | undefined;
  itemBefore: string | undefined;
};

const scalar = (value: QueryValue): string | undefined => typeof value === "string" ? value : undefined;

export function readHistoryQuery(query: Record<string, QueryValue>): HistoryQuery {
  return {
    mode: query.mode === "events" || (query.mode === undefined && (query.view === "key" || query.view === "all")) ? "events" : "items",
    view: query.view === "all" ? "all" : "key",
    before: scalar(query.before),
    item: scalar(query.item),
    itemBefore: scalar(query.itemBefore),
  };
}

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
