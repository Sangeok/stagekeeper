export type TimelineEvent = {
  at: Date;
  actor: string;
  from: string | null;
  to: string | null;
  note: string | null;
};

export type ItemDoc = { label: string; path: string; href: string };

export type BoardItemView = {
  key: string;
  title: string;
  area: string;
  agent: string;
  status: string;
  reason: string;
  results: string[];
  validation: string | null;
  proposedOn: Date;
  docs: ItemDoc[];
  events: TimelineEvent[];
};

const stamp = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ");

export function BoardItemPage({ item }: { item: BoardItemView }) {
  return (
    <main className="mx-auto w-full max-w-3xl space-y-8 px-4 py-10">
      <header className="space-y-1">
        <p className="font-mono text-xs text-zinc-500">
          {item.key} · {item.agent} · {item.area}
        </p>
        <h1 className="text-2xl font-semibold">{item.title}</h1>
        <p className="text-sm text-zinc-600">
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs">{item.status}</span>
          <span className="ml-2 text-xs text-zinc-500">{stamp(item.proposedOn)} 선정</span>
        </p>
      </header>

      <dl className="space-y-3 text-sm">
        <div>
          <dt className="text-xs uppercase tracking-wide text-zinc-500">증거</dt>
          <dd className="whitespace-pre-wrap">{item.reason}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-zinc-500">결과</dt>
          <dd>
            {item.results.length === 0 ? (
              <span className="text-zinc-400">아직 없음</span>
            ) : (
              <ol className="list-decimal space-y-1 pl-5">
                {item.results.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ol>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-zinc-500">검증</dt>
          <dd>{item.validation ?? <span className="text-zinc-400">검증 전</span>}</dd>
        </div>
      </dl>

      {item.docs.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">문서</h2>
          <ul className="space-y-1 text-sm">
            {item.docs.map((doc) => (
              <li key={doc.href}>
                <a href={doc.href} target="_blank" rel="noreferrer" className="underline">
                  {doc.label}
                </a>
                <span className="ml-2 font-mono text-xs text-zinc-500">{doc.path}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">이력</h2>
        <ol className="space-y-1 text-sm">
          {item.events.map((e, i) => (
            <li key={i} className="flex flex-wrap gap-2">
              <span className="font-mono text-xs text-zinc-500">{stamp(e.at)}</span>
              <span className="text-xs text-zinc-500">{e.actor}</span>
              <span>
                {e.from ?? "—"} → {e.to ?? "폐기"}
              </span>
              {e.note ? <span className="text-xs text-zinc-500">({e.note})</span> : null}
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
