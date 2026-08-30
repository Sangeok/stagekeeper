"use client";
import Link from "next/link";
import { useActionState, useState } from "react";

import { TokenReveal } from "@/fsd/entities/project-token";
import { Button } from "@/fsd/shared/ui/button";
import { Field, Input } from "@/fsd/shared/ui/field";
import type { CreateProjectState } from "../model/create-project-state";
import { parseRepoUrl, slugFromRepo, type RepoOption } from "../model/repo-url";

// 서버 액션과 저장소 목록은 route가 prop으로 넘긴다 — "use client" 파일은 *.server·@/server를 import할 수 없다(fsd.md).
type Props = {
  action: (prev: CreateProjectState, form: FormData) => Promise<CreateProjectState>;
  mcpUrl: string;
  defaultOwner: string;
  repos: RepoOption[]; // 로그인 계정의 공개 저장소. 비공개는 여기 없다 — 그때는 주소를 붙여넣는다
};

const TEXT_BUTTON = "text-xs text-quiet underline underline-offset-2";

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
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold tracking-tight">Project created</h2>
        <TokenReveal token={state.token} mcpUrl={mcpUrl} />
        <Link className="self-start text-sm underline underline-offset-2" href={`/p/${state.slug}`}>
          Open /p/{state.slug}
        </Link>
      </section>
    );
  }

  const needle = query.trim().toLowerCase();
  const matches = needle === "" ? repos : repos.filter((option) => option.name.toLowerCase().includes(needle));

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {chosen ? (
        <div className="flex items-start justify-between gap-3 rounded-md bg-field px-3 py-2 text-sm">
          <p className="flex flex-wrap gap-x-2">
            <span className="font-mono">
              {owner}/{repo}
            </span>
            <span className="text-quiet">· {branch}</span>
            <span className="font-mono text-quiet">· /p/{slug}</span>
          </p>
          <span className="flex shrink-0 gap-3">
            <button type="button" onClick={() => setEditing((value) => !value)} className={TEXT_BUTTON}>
              {editing ? "Collapse" : "Edit"}
            </button>
            <button type="button" onClick={reset} className={TEXT_BUTTON}>
              Start over
            </button>
          </span>
        </div>
      ) : manual ? (
        <div className="flex flex-col gap-1">
          <Field label="Repository URL">
            <Input
              type="text"
              inputMode="url"
              autoFocus
              placeholder="https://github.com/owner/repo"
              onChange={(event) => applyPaste(event.target.value)}
            />
          </Field>
          {repos.length > 0 ? (
            <button type="button" onClick={() => setManual(false)} className={`self-start ${TEXT_BUTTON}`}>
              Pick from my repositories
            </button>
          ) : (
            <span className="text-xs text-quiet">Couldn&apos;t load your repositories. Paste a URL.</span>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Field label="Repository">
            <Input
              type="search"
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Search ${repos.length} repositories`}
            />
          </Field>
          <ul className="max-h-64 overflow-y-auto rounded-lg border border-rule bg-paper">
            {matches.length === 0 ? (
              <li className="px-3 py-3 text-sm text-quiet">No repository matches.</li>
            ) : (
              matches.map((option) => (
                <li key={option.name} className="border-b border-rule last:border-b-0">
                  <button
                    type="button"
                    onClick={() => pick(option)}
                    className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-field"
                  >
                    <span className="font-mono">{option.name}</span>
                    <span className="shrink-0 font-mono text-xs text-quiet">{option.defaultBranch}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
          <p className="text-xs text-quiet">
            Private repositories aren&apos;t listed.{" "}
            <button type="button" onClick={() => setManual(true)} className="underline underline-offset-2">
              Paste a URL instead
            </button>
          </p>
        </div>
      )}

      {pasteError ? <p className="text-sm text-risk">{pasteError}</p> : null}

      {/* 접혀 있어도 값은 폼과 함께 전송된다 — hidden은 제출을 막지 않는다. */}
      <div hidden={!editing} className="flex flex-col gap-4 border-l-2 border-rule pl-4">
        <Field label="GitHub owner">
          <Input name="owner" required value={owner} onChange={(event) => setOwner(event.target.value)} />
        </Field>
        <Field label="GitHub repo">
          <Input name="repo" required value={repo} onChange={(event) => setRepo(event.target.value)} />
        </Field>
        <Field label="Branch">
          <Input name="branch" value={branch} onChange={(event) => setBranch(event.target.value)} />
        </Field>
        <Field label="URL slug" hint="Becomes /p/<slug>. Lowercase letters, numbers, and dashes, 2–40 characters.">
          <Input
            name="slug"
            required
            value={slug}
            onChange={(event) => {
              setSlug(event.target.value);
              setSlugTouched(true);
            }}
          />
        </Field>
        <Field label="Display name">
          <Input name="name" placeholder={repo || "Defaults to the slug"} />
        </Field>
      </div>

      {state.error ? <p className="text-sm text-risk">{state.error}</p> : null}

      <div>
        <Button variant="mine" type="submit" disabled={pending || !chosen}>
          {pending ? "Creating…" : "Create project"}
        </Button>
      </div>

      <p className="text-xs text-quiet">Stagekeeper doesn&apos;t read the repository. It only uses the name and the default branch.</p>
    </form>
  );
}
