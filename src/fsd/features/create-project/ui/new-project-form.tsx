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

export function NewProjectForm({ action, mcpUrl, defaultOwner }: Props) {
  const [state, formAction, pending] = useActionState(action, {} as CreateProjectState);
  const [owner, setOwner] = useState(defaultOwner);
  const [repo, setRepo] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [pasteError, setPasteError] = useState<string | null>(null);

  // 붙여넣은 주소에서 owner·repo를 채운다. slug는 사용자가 직접 고치기 전까지만 따라간다.
  const applyPaste = (value: string) => {
    if (value.trim() === "") {
      setPasteError(null);
      return;
    }
    const ref = parseRepoUrl(value);
    if (!ref) {
      setPasteError("GitHub 저장소 주소로 읽지 못했습니다. 아래 칸을 직접 채워도 됩니다");
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

  return (
    <form action={formAction} className="space-y-4">
      <label className="block space-y-1">
        <span className="text-sm font-medium">저장소 주소 붙여넣기</span>
        <input
          type="text"
          inputMode="url"
          placeholder="https://github.com/owner/repo"
          onChange={(event) => applyPaste(event.target.value)}
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
        <span className="block text-xs text-zinc-500">
          붙여넣으면 아래 칸이 채워집니다. 서비스가 GitHub에 접속하지는 않습니다 — 주소를 읽기만 합니다.
        </span>
        {pasteError ? <span className="block text-xs text-amber-700">{pasteError}</span> : null}
      </label>

      <hr className="border-zinc-200" />

      <label className="block space-y-1">
        <span className="text-sm font-medium">slug *</span>
        <input
          name="slug"
          required
          value={slug}
          onChange={(event) => {
            setSlug(event.target.value);
            setSlugTouched(true);
          }}
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
        <span className="block text-xs text-zinc-500">주소가 된다: /p/&lt;slug&gt;. 소문자·숫자·하이픈 2~40자</span>
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium">이름</span>
        <input name="name" className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
        <span className="block text-xs text-zinc-500">비우면 slug를 쓴다</span>
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium">GitHub owner *</span>
        <input
          name="owner"
          required
          value={owner}
          onChange={(event) => setOwner(event.target.value)}
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
        <span className="block text-xs text-zinc-500">기본값은 로그인한 GitHub 계정</span>
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium">GitHub repo *</span>
        <input
          name="repo"
          required
          value={repo}
          onChange={(event) => setRepo(event.target.value)}
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium">브랜치</span>
        <input name="branch" className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
        <span className="block text-xs text-zinc-500">비우면 main</span>
      </label>

      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {pending ? "만드는 중…" : "프로젝트 만들기"}
      </button>
    </form>
  );
}
