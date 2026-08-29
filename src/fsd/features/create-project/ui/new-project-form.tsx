"use client";
import { useActionState, useState } from "react";
import type { CreateProjectState } from "../model/create-project-state";
import { parseRepoUrl, slugFromRepo } from "../model/repo-url";

// 서버 액션은 route가 prop으로 넘긴다 — "use client" 파일은 *.server를 import할 수 없다(fsd.md).
type Props = {
  action: (prev: CreateProjectState, form: FormData) => Promise<CreateProjectState>;
  mcpUrl: string;
  defaultOwner: string; // 로그인한 GitHub 계정. 이미 아는 값을 다시 타이핑시키지 않는다
};

const FIELD_CLASS = "w-full rounded-md border border-zinc-300 px-3 py-2 text-sm";

export function NewProjectForm({ action, mcpUrl, defaultOwner }: Props) {
  const [state, formAction, pending] = useActionState(action, {} as CreateProjectState);
  const [owner, setOwner] = useState(defaultOwner);
  const [repo, setRepo] = useState("");
  const [slug, setSlug] = useState("");
  const [branch, setBranch] = useState("main");
  const [slugTouched, setSlugTouched] = useState(false);
  // 붙여넣기로 정해지지 않는 것이 있을 때만 폼을 편다. 평소에는 칸 하나만 보인다.
  const [editing, setEditing] = useState(false);
  const [pasteError, setPasteError] = useState<string | null>(null);

  const applyPaste = (value: string) => {
    if (value.trim() === "") {
      setPasteError(null);
      return;
    }
    const ref = parseRepoUrl(value);
    if (!ref) {
      setPasteError("주소로 읽지 못했습니다. 아래에서 직접 채워 주세요");
      setEditing(true);
      return;
    }
    setPasteError(null);
    setOwner(ref.owner);
    setRepo(ref.repo);
    if (!slugTouched) setSlug(slugFromRepo(ref.repo));
  };

  if (state.token && state.slug) {
    return (
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">프로젝트를 만들었습니다</h2>
        <p className="text-sm text-zinc-600">
          아래 토큰은 <strong>지금 한 번만</strong> 보입니다. 서비스는 해시만 저장합니다.
        </p>
        <code className="block break-all rounded-md bg-zinc-100 p-3 font-mono text-sm">{state.token}</code>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-zinc-700">
          <li>이 값을 환경변수 <code className="font-mono">HARNESS_TOKEN</code>으로 저장합니다.</li>
          <li>MCP 서버 URL은 <code className="font-mono">{mcpUrl}</code>입니다.</li>
          <li>연결할 저장소에서 <code className="font-mono">/harness:init</code>을 실행합니다.</li>
        </ol>
        <a className="inline-block text-sm underline" href={`/p/${state.slug}/tokens`}>
          토큰 페이지로 이동
        </a>
      </section>
    );
  }

  const ready = slug !== "" && owner !== "" && repo !== "";

  return (
    <form action={formAction} className="space-y-4">
      <label className="block space-y-1">
        <span className="text-sm font-medium">연결할 저장소 주소</span>
        <input
          type="text"
          inputMode="url"
          autoFocus
          placeholder="https://github.com/owner/repo"
          onChange={(event) => applyPaste(event.target.value)}
          className={FIELD_CLASS}
        />
      </label>

      {pasteError ? <p className="text-sm text-amber-700">{pasteError}</p> : null}

      {ready && !editing ? (
        <div className="flex items-start justify-between gap-3 rounded-md bg-zinc-50 px-3 py-2 text-sm">
          <p className="space-x-2">
            <span className="font-mono">
              {owner}/{repo}
            </span>
            <span className="text-zinc-500">· {branch}</span>
            <span className="text-zinc-500">· 주소 /p/{slug}</span>
          </p>
          <button type="button" onClick={() => setEditing(true)} className="shrink-0 text-xs text-zinc-500 underline">
            고치기
          </button>
        </div>
      ) : null}

      {/* 접혀 있어도 값은 폼과 함께 전송된다 — hidden은 제출을 막지 않는다. */}
      <div hidden={ready && !editing} className="space-y-4 border-l-2 border-zinc-200 pl-4">
        <label className="block space-y-1">
          <span className="text-sm font-medium">GitHub owner *</span>
          <input name="owner" required value={owner} onChange={(e) => setOwner(e.target.value)} className={FIELD_CLASS} />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">GitHub repo *</span>
          <input name="repo" required value={repo} onChange={(e) => setRepo(e.target.value)} className={FIELD_CLASS} />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">브랜치</span>
          <input name="branch" value={branch} onChange={(e) => setBranch(e.target.value)} className={FIELD_CLASS} />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">주소(slug) *</span>
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
          <span className="block text-xs text-zinc-500">/p/&lt;slug&gt; 가 된다. 소문자·숫자·하이픈 2~40자</span>
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">표시 이름</span>
          <input name="name" placeholder={repo || "비우면 slug를 쓴다"} className={FIELD_CLASS} />
        </label>
      </div>

      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}

      <button
        type="submit"
        disabled={pending || !ready}
        className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-40"
      >
        {pending ? "만드는 중…" : "프로젝트 만들기"}
      </button>

      <p className="text-xs text-zinc-500">
        서비스는 이 저장소에 접속하지 않습니다 — 주소를 읽어 링크를 만드는 데만 씁니다.
      </p>
    </form>
  );
}
