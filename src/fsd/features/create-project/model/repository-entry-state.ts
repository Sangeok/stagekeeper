import { parseRepoUrl, slugFromRepo, type RepoOption } from "./repo-url";
import { selectedRepository, type RepositorySelection } from "./repository-selection";

export type RepositoryEntryState = { selection: RepositorySelection; manual: boolean; editing: boolean; query: string; urlDraft: string };
export type RepositoryEntryEvent =
  | { type: "picker" } | { type: "manual" } | { type: "edit" } | { type: "reset" }
  | { type: "paste"; value: string } | { type: "query"; value: string }
  | { type: "direct"; owner: string; repo: string } | { type: "pick"; option: RepoOption };
type EntryTransition = { state: RepositoryEntryState; slug?: string; branch?: string; resetDetails?: true };

export function initialRepositoryEntry(manual: boolean): RepositoryEntryState {
  return { selection: manual ? { source: "url", url: "" } : { source: "picker", repository: null }, manual, editing: false, query: "", urlDraft: "" };
}

export function transitionRepositoryEntry(state: RepositoryEntryState, event: RepositoryEntryEvent, context: { defaultOwner: string; slugTouched: boolean }): EntryTransition {
  const parsedSlug = (url: string) => {
    const ref = parseRepoUrl(url);
    return ref && !context.slugTouched ? { slug: slugFromRepo(ref.repo) } : {};
  };
  switch (event.type) {
    // Picker entry intentionally keeps editing and the stored URL draft.
    case "picker": return { state: { ...state, manual: false, selection: { source: "picker", repository: null } } };
    case "manual": return { state: { ...state, manual: true, query: "", selection: { source: "url", url: state.urlDraft } }, ...parsedSlug(state.urlDraft) };
    case "paste": return { state: { ...state, urlDraft: event.value, selection: { source: "url", url: event.value } }, ...parsedSlug(event.value) };
    case "query": return { state: { ...state, query: event.value } };
    case "direct": return { state: { ...state, selection: { source: "direct", owner: event.owner, repo: event.repo } } };
    case "edit": {
      if (state.editing) return { state: { ...state, editing: false } };
      const repository = state.selection.source === "direct" ? state.selection : selectedRepository(state.selection);
      return { state: { ...state, editing: true, selection: { source: "direct", owner: repository?.owner || context.defaultOwner, repo: repository?.repo ?? "" } } };
    }
    case "pick": return { state: { ...state, selection: { source: "picker", repository: { owner: context.defaultOwner, repo: event.option.name } } },
      branch: event.option.defaultBranch, ...(!context.slugTouched ? { slug: slugFromRepo(event.option.name) } : {}) };
    case "reset": return { state: initialRepositoryEntry(state.manual), slug: "", branch: "main", resetDetails: true };
    default: { const unreachable: never = event; return unreachable; }
  }
}
