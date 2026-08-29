import { NewTokenForm } from "@/fsd/features/manage-token";

export type TokenRow = { id: string; label: string; createdAt: Date; revokedAt: Date | null };

type Props = {
  mcpUrl: string;
  tokens: TokenRow[];
  issue: (label: string) => Promise<{ token: string }>;
  revoke: (tokenId: string) => Promise<void>;
};

const day = (d: Date) => d.toISOString().slice(0, 10);

export function ProjectTokensPage({ mcpUrl, tokens, issue, revoke }: Props) {
  return (
    <main className="mx-auto w-full max-w-3xl space-y-8 px-4 py-10">
      <section className="space-y-2">
        <h1 className="text-2xl font-semibold">토큰</h1>
        <p className="text-sm text-zinc-600">
          에이전트는 이 토큰으로만 서비스에 붙습니다. 게이트·백로그 편집 도구는 토큰에 없습니다 — 웹 전용입니다.
        </p>
        <p className="text-sm text-zinc-600">
          MCP 서버 URL: <code className="font-mono">{mcpUrl}</code>
        </p>
      </section>

      <NewTokenForm issue={issue} mcpUrl={mcpUrl} />

      <table className="w-full text-left text-sm">
        <thead className="border-b border-zinc-200 text-xs uppercase text-zinc-500">
          <tr>
            <th className="py-2">label</th>
            <th className="py-2">발급</th>
            <th className="py-2">상태</th>
            <th className="py-2">참조값</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {tokens.map((t) => (
            <tr key={t.id}>
              <td className="py-2">{t.label}</td>
              <td className="py-2">{day(t.createdAt)}</td>
              <td className="py-2">{t.revokedAt ? `폐기 ${day(t.revokedAt)}` : "사용 중"}</td>
              <td className="py-2 font-mono text-xs text-zinc-500">token:{t.id}</td>
              <td className="py-2 text-right">
                {t.revokedAt ? null : (
                  <form action={revoke.bind(null, t.id)}>
                    <button type="submit" className="rounded-md border border-zinc-300 px-3 py-1 text-xs">
                      폐기
                    </button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
