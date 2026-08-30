"use client";
import { useActionState, useState } from "react";
import { TokenReveal } from "@/fsd/entities/project-token";
import type { CreateProjectState } from "../model/create-project-state";
import { parseRepoUrl, slugFromRepo, type RepoOption } from "../model/repo-url";

// 서버 액션과 저장소 목록은 route가 prop으로 넘긴다 — "use client" 파일은 *.server·@/server를 import할 수 없다(fsd.md).
type Props = {
  action: (prev: CreateProjectState, form: FormData) => Promise<CreateProjectState>;
  mcpUrl: string;
  defaultOwner: string;
  repos: RepoOption[]; // 로그인 계정의 공개 저장소. 비공개는 여기 없다 — 그때는 주소를 붙여넣는다
};

const FIELD_CLASS = "w-full rounded-md border border-zinc-300 px-3 py-2 text-sm";

export function NewProjectForm({ action, mcpUrl, defaultOwner, repos }: Props) {
  const [state, formAction, pending] = useActionState(action, {} as CreateProjectState);
  const [owner, setOwner] = useState(defaultOwner);
  const [repo, setRepo] = useState("");
  const [slug, setSlug] = useState("");
  const [branch, setBranch] = useState("main");
  const [slugTouched, setSlugTouched] = useState(false);
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState("");
  // 목록이 비면(비공개만 있거나 GitHub가 답하지 않으면) 붙여넣기가 유일한 길이다.
  const [manual, setManual] = useState(repos.length === 0);
  const [pasteError, setPasteError] = useState<string | null>(null);

  const chosen = slug !== "" && owner !== "" && repo !== "";

  const pick = (option: RepoOption) => {
    setOwner(defaultOwner);
    setRepo(option.name);
    setBranch(option.defaultBranch);
    if (!slugTouched) setSlug(slugFromRepo(option.name));
    setPasteError(null);
  };

  const applyPaste = (value: string) => {
    if (value.trim() === "") {
      setPasteError(null);
      return;
    }
    const ref = parseRepoUrl(value);
    if (!ref) {
      setPasteError("That doesn't look like a GitHub repository URL. Use Edit to fill in the fields.");
      return;
    }
    setPasteError(null);
    setOwner(ref.owner);
    setRepo(ref.repo);
    if (!slugTouched) setSlug(slugFromRepo(ref.repo));
  };

  const reset = () => {
    setRepo("");
    setSlug("");
    setBranch("main");
    setOwner(defaultOwner);
    setSlugTouched(false);
    setEditing(false);
  };

  if (state.token && state.slug) {
    return (
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Project created</h2>
        <TokenReveal token={state.token} mcpUrl={mcpUrl} />
        <a className="inline-block text-sm underline" href={`/p/${state.slug}`}>
          Open /p/{state.slug}
        </a>
      </section>
    );
  }

  const needle = query.trim().toLowerCase();
  const matches = needle === "" ? repos : repos.filter((option) => option.name.toLowerCase().includes(needle));

  return (
    <form action={formAction} className="space-y-4">
      {chosen ? (
        <div className="flex items-start justify-between gap-3 rounded-md bg-zinc-50 px-3 py-2 text-sm">
          <p className="space-x-2">
            <span className="font-mono">
              {owner}/{repo}
            </span>
            <span className="text-zinc-500">· {branch}</span>
            <span className="font-mono text-zinc-500">· /p/{slug}</span>
          </p>
          <span className="flex shrink-0 gap-3 text-xs text-zinc-500">
            <button type="button" onClick={() => setEditing((value) => !value)} className="underline">
              {editing ? "Collapse" : "Edit"}
            </button>
            <button type="button" onClick={reset} className="underline">
              Start over
            </button>
          </span>
        </div>
      ) : manual ? (
        <div className="space-y-1">
          <label className="block space-y-1">
            <span className="text-sm font-medium">Repository URL</span>
            <input
              type="text"
              inputMode="url"
              autoFocus
              placeholder="https://github.com/owner/repo"
              onChange={(event) => applyPaste(event.target.value)}
              className={FIELD_CLASS}
            />
          </label>
          {repos.length > 0 ? (
            <button type="button" onClick={() => setManual(false)} className="text-xs text-zinc-500 underline">
              Pick from my repositories
            </button>
          ) : (
            <span className="block text-xs text-zinc-500">
              Couldn&apos;t load your repositories. Paste a URL.
            </span>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <span className="block text-sm font-medium">Repository</span>
          <input
            type="search"
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${repos.length} repositories`}
            className={FIELD_CLASS}
          />
          <ul className="max-h-64 divide-y divide-zinc-100 overflow-y-auto rounded-md border border-zinc-200">
            {matches.length === 0 ? (
              <li className="px-3 py-3 text-sm text-zinc-500">No repository matches.</li>
            ) : (
              matches.map((option) => (
                <li key={option.name}>
                  <button
                    type="button"
                    onClick={() => pick(option)}
                    className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-zinc-50"
                  >
                    <span className="font-mono">{option.name}</span>
                    <span className="shrink-0 text-xs text-zinc-500">{option.defaultBranch}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
          <p className="text-xs text-zinc-500">
            Private repositories aren&apos;t listed.{" "}
            <button type="button" onClick={() => setManual(true)} className="underline">
              Paste a URL instead
            </button>
          </p>
        </div>
      )}

      {pasteError ? <p className="text-sm text-amber-700">{pasteError}</p> : null}

      {/* 접혀 있어도 값은 폼과 함께 전송된다 — hidden은 제출을 막지 않는다. */}
      <div hidden={!editing} className="space-y-4 border-l-2 border-zinc-200 pl-4">
        <label className="block space-y-1">
          <span className="text-sm font-medium">GitHub owner</span>
          <input
            name="owner"
            required
            value={owner}
            onChange={(event) => setOwner(event.target.value)}
            className={FIELD_CLASS}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">GitHub repo</span>
          <input
            name="repo"
            required
            value={repo}
            onChange={(event) => setRepo(event.target.value)}
            className={FIELD_CLASS}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Branch</span>
          <input
            name="branch"
            value={branch}
            onChange={(event) => setBranch(event.target.value)}
            className={FIELD_CLASS}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">URL slug</span>
          <input
            name="slug"
            required
            value={slug}
            onChange={(event) => {
              setSlug(event.target.value);
              setSlugTouched(true);
            }}
            className={FIELD_CLASS}
          />
          <span className="block text-xs text-zinc-500">Becomes /p/&lt;slug&gt;. Lowercase letters, numbers, and dashes, 2–40 characters.</span>
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Display name</span>
          <input name="name" placeholder={repo || "Defaults to the slug"} className={FIELD_CLASS} />
        </label>
      </div>

      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}

      <button
        type="submit"
        disabled={pending || !chosen}
        className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-40"
      >
        {pending ? "Creating…" : "Create project"}
      </button>

      <p className="text-xs text-zinc-500">Stagekeeper doesn&apos;t read the repository. It only uses the name and the default branch.</p>
    </form>
  );
}
