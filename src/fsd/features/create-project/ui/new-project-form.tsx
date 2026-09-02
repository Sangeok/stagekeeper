"use client";
import Link from "next/link";
import { useActionState, useState } from "react";

import { TokenReveal } from "@/fsd/entities/project-token";
import { Button } from "@/fsd/shared/ui/button";
import { Field, Input } from "@/fsd/shared/ui/field";
import type { CreateProjectState } from "../model/create-project-state";
import { SLUG_HINT } from "../model/project-slug";
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
  const [state, formAction, pending] = useActionState(action, {});
  const [owner, setOwner] = useState(defaultOwner);
  const [repo, setRepo] = useState("");
  const [slug, setSlug] = useState("");
  const [branch, setBranch] = useState("main");
  const [slugTouched, setSlugTouched] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [query, setQuery] = useState("");
  // 목록이 비면(비공개만 있거나 GitHub가 답하지 않으면) 붙여넣기가 유일한 길이다.
  const [isManualEntry, setIsManualEntry] = useState(repos.length === 0);
  const [pasteError, setPasteError] = useState<string | null>(null);

  const isRepoChosen = slug !== "" && owner !== "" && repo !== "";

  // 모드를 바꿀 때는 그 모드에만 속한 상태를 함께 비운다. 예전에는 붙여넣기 오류가
  // picker 화면까지 따라와서, 지금 보는 화면과 무관한 문구가 남아 있었다.
  const showPicker = () => {
    setIsManualEntry(false);
    setPasteError(null);
  };
  const showManualEntry = () => {
    setIsManualEntry(true);
    setQuery("");
  };

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
    setIsEditing(false);
    // 다시 고를 때 이전 검색어와 오류가 남아 있으면 "처음부터"가 아니다.
    setQuery("");
    setPasteError(null);
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

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {isRepoChosen ? (
        <div className="flex items-start justify-between gap-3 rounded-md bg-field px-3 py-2 text-sm">
          <p className="flex flex-wrap gap-x-2">
            <span className="font-mono">
              {owner}/{repo}
            </span>
            <span className="text-quiet">· {branch}</span>
            <span className="font-mono text-quiet">· /p/{slug}</span>
          </p>
          <span className="flex shrink-0 gap-3">
            <button type="button" onClick={() => setIsEditing((value) => !value)} className={TEXT_BUTTON}>
              {isEditing ? "Collapse" : "Edit"}
            </button>
            <button type="button" onClick={reset} className={TEXT_BUTTON}>
              Start over
            </button>
          </span>
        </div>
      ) : isManualEntry ? (
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
            <button type="button" onClick={showPicker} className={`self-start ${TEXT_BUTTON}`}>
              Pick from my repositories
            </button>
          ) : (
            <span className="text-xs text-quiet">Couldn&apos;t load your repositories. Paste a URL.</span>
          )}
        </div>
      ) : (
        <RepoPicker
          repos={repos}
          query={query}
          setQuery={setQuery}
          pick={pick}
          pasteInstead={showManualEntry}
        />
      )}

      {pasteError ? <p className="text-sm text-risk">{pasteError}</p> : null}

      {/* 접혀 있어도 값은 폼과 함께 전송된다 — hidden은 제출을 막지 않는다. */}
      <div hidden={!isEditing} className="flex flex-col gap-4 border-l-2 border-rule pl-4">
        <Field label="GitHub owner">
          <Input name="owner" required value={owner} onChange={(event) => setOwner(event.target.value)} />
        </Field>
        <Field label="GitHub repo">
          <Input name="repo" required value={repo} onChange={(event) => setRepo(event.target.value)} />
        </Field>
        <Field label="Branch">
          <Input name="branch" value={branch} onChange={(event) => setBranch(event.target.value)} />
        </Field>
        <Field label="URL slug" hint={SLUG_HINT}>
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
        <Button variant="mine" type="submit" disabled={pending || !isRepoChosen}>
          {pending ? "Creating…" : "Create project"}
        </Button>
      </div>

      <p className="text-xs text-quiet">Stagekeeper doesn&apos;t read the repository. It only uses the name and the default branch.</p>
    </form>
  );
}

// 내 저장소 고르기: 검색 + 목록. autoFocus 입력을 들고 있으므로 모듈 최상위에 둔다 —
// 부모 함수 안에서 정의하면 타이핑마다 새 컴포넌트 타입이 되어 입력이 remount되고 포커스를 잃는다.
function RepoPicker({
  repos,
  query,
  setQuery,
  pick,
  pasteInstead,
}: {
  repos: RepoOption[];
  query: string;
  setQuery: (value: string) => void;
  pick: (option: RepoOption) => void;
  pasteInstead: () => void;
}) {
  const needle = query.trim().toLowerCase();
  const matches = needle === "" ? repos : repos.filter((option) => option.name.toLowerCase().includes(needle));

  return (
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
        <button type="button" onClick={pasteInstead} className="underline underline-offset-2">
          Paste a URL instead
        </button>
      </p>
    </div>
  );
}
