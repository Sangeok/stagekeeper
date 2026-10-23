"use client";
import Link from "next/link";
import { useActionState, useCallback, useRef, useState, type ReactElement } from "react";

import { TokenReveal } from "@/fsd/entities/project-token";
import { projectPath } from "@/fsd/shared/routes/project";
import { Button } from "@/fsd/shared/ui/button";
import { Field, Input } from "@/fsd/shared/ui/field";
import { IDLE, type CreateProjectState } from "../model/create-project-state";
import { SLUG_HINT } from "../model/project-slug";
import type { RepoOption } from "../model/repo-url";
import { selectedRepository } from "../model/repository-selection";
import { initialRepositoryEntry, transitionRepositoryEntry, type RepositoryEntryEvent } from "../model/repository-entry-state";
import { combineRepositories, OFF_PICKER, type PickerInitialState, type SavedDraft } from "../model/github-connection-state";
import { useRepositoryPicker } from "../model/use-repository-picker";
import { RepositoryConnectionPanel } from "./repository-connection-panel";

type Props = {
  action: (prev: CreateProjectState, form: FormData) => Promise<CreateProjectState>;
  mcpUrl: string;
  defaultOwner: string;
  repoLoadFailed: boolean;
  repos: RepoOption[];
  picker?: PickerInitialState;
};

const TEXT_BUTTON = "text-xs text-quiet underline underline-offset-2";

export type FormMode = "manual" | "chosen" | "picker";
export function formMode(isManualEntry: boolean, isRepoChosen: boolean): FormMode {
  if (isManualEntry) return "manual";
  return isRepoChosen ? "chosen" : "picker";
}

type CompletedRegistration = Extract<CreateProjectState, { status: "created" | "existing" | "disconnected" }>;

export function ProjectRegistrationResult({ state, mcpUrl }: { state: CompletedRegistration; mcpUrl: string }): ReactElement {
  const heading = state.status === "created" ? "Project created" : state.status === "existing" ? "Project already connected" : "Repository disconnected";
  return <section className="flex flex-col gap-4">
    <h2 className="text-lg font-semibold tracking-tight">{heading}</h2>
    {state.status === "created" ? <TokenReveal token={state.token} mcpUrl={mcpUrl} /> : <p className="text-sm text-quiet">{state.status === "disconnected"
      ? "Your data is preserved. Open the project and choose Reconnect repository."
      : "Use the existing project. No new token was created."}</p>}
    <Link className="self-start text-sm underline underline-offset-2" href={projectPath(state.slug)}>Open /p/{state.slug}</Link>
  </section>;
}

export function NewProjectForm(props: Props): ReactElement {
  const [sessionExpired, setSessionExpired] = useState(false);
  const expireSession = useCallback(() => setSessionExpired(true), []);
  if (sessionExpired) return <section role="alert" className="flex flex-col gap-3 text-sm">
    <p>Your session changed or expired. Sign in again before creating a project.</p>
    <Link href="/login" className="underline underline-offset-2">Sign in again</Link>
  </section>;
  return <NewProjectFormContents {...props} expireSession={expireSession} />;
}

function NewProjectFormContents({ action, mcpUrl, defaultOwner, repos, repoLoadFailed, picker = OFF_PICKER, expireSession }: Props & { expireSession: () => void }): ReactElement {
  const [state, formAction, pending] = useActionState(action, IDLE);
  const [entry, setEntry] = useState(() => initialRepositoryEntry(repos.length === 0 && !(picker.connection.available && picker.connection.status === "connected")));
  const { selection, manual: isManualEntry, editing: isEditing, query, urlDraft: urlText } = entry;
  const [slug, setSlug] = useState("");
  const [branch, setBranch] = useState("main");
  const [name, setName] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [branchTouched, setBranchTouched] = useState(false);
  const locallyEdited = useRef(false);
  const restore = useCallback((draft: SavedDraft) => {
    if (locallyEdited.current) return false;
    setEntry({ selection: draft.selection, manual: draft.manual, editing: draft.editing, query: "", urlDraft: draft.urlDraft });
    setSlug(draft.slug); setName(draft.name); setBranch(draft.branch); setSlugTouched(draft.slugTouched); setBranchTouched(draft.branchTouched);
    return true;
  }, []);
  const invalidateSelection = useCallback(() => {
    setEntry(previous => previous.selection.source === "authorized" ? { ...previous, selection: { source: "url", url: "" }, manual: true, editing: false, urlDraft: "", query: "" } : previous);
  }, []);
  const github = useRepositoryPicker(picker, restore, expireSession, invalidateSelection);
  const publicRepos = repos.filter(option => option.source === "public");
  const options = combineRepositories(publicRepos, github.query.repositories);
  const currentAuthorization = selection.source === "authorized" ? github.query.repositories.find(option => option.repositoryId === selection.repository.repositoryId
    && option.owner === selection.repository.owner && option.name === selection.repository.name) : undefined;
  const effectiveSelection = selection.source === "authorized" && currentAuthorization ? { source: "authorized" as const, repository: currentAuthorization } : selection;
  const draft: SavedDraft = { selection: effectiveSelection, slug, name, branch, slugTouched, branchTouched, manual: isManualEntry, editing: isEditing, urlDraft: urlText };

  const repository = selectedRepository(selection);
  const owner = selection.source === "direct" ? selection.owner : repository?.owner ?? "";
  const repo = selection.source === "direct" ? selection.repo : repository?.repo ?? "";
  const pasteError = selection.source === "url" && selection.url.trim() !== "" && repository === null
    ? "That doesn't look like a GitHub repository URL. Use Edit to fill in the fields." : null;
  const isRepoChosen = slug !== "" && repository !== null;
  const mode = formMode(isManualEntry, isRepoChosen);

  const changeEntry = (event: RepositoryEntryEvent) => {
    locallyEdited.current = true;
    const next = transitionRepositoryEntry(entry, event, { defaultOwner, slugTouched });
    setEntry(next.state);
    if (next.slug !== undefined) setSlug(next.slug);
    if (next.branch !== undefined) setBranch(next.branch);
    if (event.type === "pick") setBranchTouched(false);
    if (next.resetDetails) {
      setSlugTouched(false);
      setName("");
      setBranchTouched(false);
    }
  };
  const showPicker = () => changeEntry({ type: "picker" });
  const showManualEntry = () => changeEntry({ type: "manual" });
  const pick = (option: RepoOption) => changeEntry({ type: "pick", option });
  const toggleEditing = () => changeEntry({ type: "edit" });
  const reset = () => { changeEntry({ type: "reset" }); void github.discardDraft(); };

  const chosenSummary = (
    <div className="flex items-start justify-between gap-3 rounded-md bg-field px-3 py-2 text-sm">
      <p className="flex flex-wrap gap-x-2">
        <span className="font-mono">
          {owner}/{repo}
        </span>
        <span className="text-quiet">· {branch || "Enter a branch"}</span>
        <span className="font-mono text-quiet">· /p/{slug}</span>
      </p>
      <span className="flex shrink-0 gap-3">
        <button type="button" onClick={toggleEditing} className={TEXT_BUTTON}>
          {isEditing ? "Collapse" : "Edit"}
        </button>
        <button type="button" onClick={reset} className={TEXT_BUTTON}>
          Start over
        </button>
      </span>
    </div>
  );

  if (state.status === "created" || state.status === "existing" || state.status === "disconnected") return <ProjectRegistrationResult state={state} mcpUrl={mcpUrl} />;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="expectedUserId" value={picker.userKey} />
      <input type="hidden" name="repositorySource" value={selection.source === "authorized" ? "authorized" : selection.source === "picker" ? "public" : "manual"} />
      {effectiveSelection.source === "authorized" ? <>
        <input type="hidden" name="repositoryId" value={effectiveSelection.repository.repositoryId} />
        <input type="hidden" name="installationId" value={effectiveSelection.repository.installationId} />
        <input type="hidden" name="repositoryPage" value={effectiveSelection.repository.repositoryPage} />
        <input type="hidden" name="connectionRevision" value={effectiveSelection.repository.connectionRevision} />
      </> : null}
      <RepositoryConnectionPanel connection={github.connection} query={github.query} busy={github.busy} message={github.message} canRetry={github.canRetry} restoredDraftId={github.restoredDraftId}
        authorize={() => void github.start("authorize", draft)} manage={() => void github.start("manage", draft)} disconnect={revision => void github.disconnect(revision)}
        retry={() => void github.reload()} loadMore={() => void github.loadMore()} paste={showManualEntry} />
      {mode === "chosen" ? (
        chosenSummary
      ) : mode === "manual" ? (
        <div className="flex flex-col gap-1">
          <Field label="Repository URL">
            <Input
              type="text"
              inputMode="url"
              autoFocus
              placeholder="https://github.com/owner/repo"
              value={urlText}
              onChange={(event) => {
                changeEntry({ type: "paste", value: event.target.value });
              }}
            />
          </Field>
          {isRepoChosen ? chosenSummary : null}
          {!isRepoChosen ? <button type="button" onClick={toggleEditing} className={`self-start ${TEXT_BUTTON}`}>
            {isEditing ? "Collapse" : "Edit"}
          </button> : null}
          {options.length > 0 ? (
            <button type="button" onClick={showPicker} className={`self-start ${TEXT_BUTTON}`}>
              Pick from my repositories
            </button>
          ) : (
            <span className="text-xs text-quiet">{repoLoadFailed ? "Couldn't load your repositories. Paste a URL." : "No public repositories found. Paste a URL."}</span>
          )}
        </div>
      ) : (
        <RepoPicker
          repos={options}
          query={query}
          setQuery={value => changeEntry({ type: "query", value })}
          pick={pick}
          pasteInstead={showManualEntry}
          linkedAvailable={github.connection.available}
          defaultOwner={defaultOwner}
        />
      )}

      {pasteError ? <p className="text-sm text-risk">{pasteError}</p> : null}

      <div hidden={!isEditing} className="flex flex-col gap-4 border-l-2 border-rule pl-4">
        <Field label="GitHub owner">
          <Input name="owner" required value={owner} onChange={(event) => changeEntry({ type: "direct", owner: event.target.value, repo })} />
        </Field>
        <Field label="GitHub repo">
          <Input name="repo" required value={repo} onChange={(event) => changeEntry({ type: "direct", owner, repo: event.target.value })} />
        </Field>
        <Field label="Branch">
          <Input name="branch" required={selection.source === "authorized"} value={branch} onChange={(event) => { locallyEdited.current = true; setBranch(event.target.value); setBranchTouched(true); }} />
        </Field>
        <Field label="URL slug" hint={SLUG_HINT}>
          <Input
            name="slug"
            required
            value={slug}
            onChange={(event) => {
              setSlug(event.target.value);
              locallyEdited.current = true;
              setSlugTouched(true);
            }}
          />
        </Field>
        <Field label="Display name">
          <Input name="name" value={name} onChange={(event) => { locallyEdited.current = true; setName(event.target.value); }} placeholder={repo || "Defaults to the slug"} />
        </Field>
      </div>

      {state.status === "error" ? <p className="text-sm text-risk">{state.error}</p> : null}

      <div>
        <Button variant="mine" type="submit" disabled={pending || !isRepoChosen || selection.source === "authorized" && (!branch.trim() || !currentAuthorization)}>
          {pending ? "Creating…" : "Create project"}
        </Button>
      </div>

      {selection.source === "authorized" && !currentAuthorization ? <p role="status" className="text-sm text-quiet">Reload the repository list and pick this repository again, or paste a URL.</p> : null}
      <p className="text-xs text-quiet">{github.connection.available ? "Stagekeeper reads repository metadata only. It does not read or write your code." : "Stagekeeper doesn't read the repository. It only uses the name and the default branch."}</p>
    </form>
  );
}

function RepoPicker({
  repos,
  query,
  setQuery,
  pick,
  pasteInstead,
  linkedAvailable,
  defaultOwner,
}: {
  repos: RepoOption[];
  query: string;
  setQuery: (value: string) => void;
  pick: (option: RepoOption) => void;
  pasteInstead: () => void;
  linkedAvailable: boolean;
  defaultOwner: string;
}) {
  const needle = query.trim().toLowerCase();
  const matches = needle === "" ? repos : repos.filter((option) => `${option.owner}/${option.name}`.toLowerCase().includes(needle));

  return (
    <div className="flex flex-col gap-2">
      <Field label="Repository">
        <Input
          type="search"
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={linkedAvailable ? `Search ${repos.length} loaded repositories` : `Search ${repos.length} public repositories`}
        />
      </Field>
      <ul className="max-h-64 overflow-y-auto rounded-lg border border-rule bg-paper">
        {matches.length === 0 ? (
          <li className="px-3 py-3 text-sm text-quiet">No repository matches.</li>
        ) : (
          matches.map((option) => (
            <li key={option.repositoryId} className="border-b border-rule last:border-b-0">
              <button
                type="button"
                onClick={() => pick(option)}
                className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-field"
              >
                <span className="font-mono">{option.source === "public" && option.owner === defaultOwner ? option.name : `${option.owner}/${option.name}`}{option.source === "authorized" && option.visibility === "private" ? " · Private" : ""}</span>
                <span className="shrink-0 font-mono text-xs text-quiet">{option.defaultBranch}</span>
              </button>
            </li>
          ))
        )}
      </ul>
      <p className="text-xs text-quiet">
        {linkedAvailable ? "Search covers loaded repositories. Allow more repositories on GitHub or " : "Private repositories aren't listed. "}
        <button type="button" onClick={pasteInstead} className="underline underline-offset-2">
          Paste a URL instead
        </button>
      </p>
    </div>
  );
}
