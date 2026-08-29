"use client";
import { useActionState } from "react";
import type { CreateProjectState } from "../model/create-project-state";

// 서버 액션은 route가 prop으로 넘긴다 — "use client" 파일은 *.server를 import할 수 없다(fsd.md).
type Props = {
  action: (prev: CreateProjectState, form: FormData) => Promise<CreateProjectState>;
  mcpUrl: string;
};

const FIELDS = [
  { name: "slug", label: "slug", hint: "주소가 된다: /p/<slug>. 소문자·숫자·하이픈 2~40자", required: true },
  { name: "name", label: "이름", hint: "비우면 slug를 쓴다", required: false },
  { name: "owner", label: "GitHub owner", hint: "예: Sangeok", required: true },
  { name: "repo", label: "GitHub repo", hint: "예: ApcH", required: true },
  { name: "branch", label: "브랜치", hint: "비우면 main", required: false },
];

export function NewProjectForm({ action, mcpUrl }: Props) {
  const [state, formAction, pending] = useActionState(action, {} as CreateProjectState);

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
      {FIELDS.map((f) => (
        <label key={f.name} className="block space-y-1">
          <span className="text-sm font-medium">
            {f.label}
            {f.required ? " *" : ""}
          </span>
          <input
            name={f.name}
            required={f.required}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
          <span className="block text-xs text-zinc-500">{f.hint}</span>
        </label>
      ))}
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
