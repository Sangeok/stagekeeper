"use client";
import { useId } from "react";
import { filterPipelines, type PipelineCatalogEntry } from "../model/pipeline-catalog";

type Props = {
  entries: PipelineCatalogEntry[]; query: string; onQueryChange: (query: string) => void;
  onSelect: (id: string) => void; selectedId?: string; disabled?: boolean;
};

export function PipelineCatalog({ entries, query, onQueryChange, onSelect, selectedId, disabled = false }: Props) {
  const searchId = useId();
  const visible = filterPipelines(entries, query);
  return <div className="flex min-w-0 flex-col gap-4">
    <div className="flex items-end gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <label htmlFor={searchId} className="text-xs text-quiet">Search by name or step</label>
        <input id={searchId} type="search" value={query} onChange={event => onQueryChange(event.target.value)}
          placeholder="Browse below or search…" className="w-full rounded-md border border-edge bg-paper px-3 py-2 text-sm" />
      </div>
      {query ? <button type="button" className="shrink-0 px-2 py-2 text-sm underline" onClick={() => onQueryChange("")}>Clear search</button> : null}
    </div>
    <p role="status" className="text-xs text-quiet">{query.trim() ? `${visible.length} of ${entries.length}` : entries.length} pipeline{entries.length === 1 ? "" : "s"}</p>
    {visible.length ? <ul className="divide-y divide-edge rounded-lg border border-edge">{visible.map(entry => <li key={entry.id}>
      <button type="button" disabled={disabled} aria-current={entry.id === selectedId ? "true" : undefined}
        className="flex w-full min-w-0 items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-field focus-visible:bg-field aria-current:bg-field disabled:opacity-50"
        onClick={() => onSelect(entry.id)}>
        <span className="flex min-w-0 flex-col gap-1">
          <span className="break-words text-sm font-medium">{entry.name}</span>
          <span className="break-words text-xs text-quiet" title={entry.steps.join(" → ")}>{entry.summary}</span>
        </span>
        <span className="shrink-0 text-xs text-quiet">{entry.id === selectedId ? "Current" : `${entry.steps.length} steps`} <span aria-hidden="true">→</span></span>
      </button>
    </li>)}</ul> : <div className="rounded-lg border border-dashed border-edge px-4 py-8 text-center">
      <p className="text-sm">{entries.length ? "No matching pipelines" : "No pipelines yet"}</p>
      <p className="mt-1 text-xs text-quiet">{entries.length ? "Try another name or step, or clear your search to browse all pipelines." : "Create a pipeline to get started."}</p>
    </div>}
  </div>;
}
