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
        <h1 className="text-2xl font-semibold">Tokens</h1>
        <p className="text-sm text-zinc-600">
          Agents connect with a token. A token can&apos;t approve or edit the backlog — those are web only.
        </p>
        <p className="text-sm text-zinc-600">
          MCP server URL: <code className="font-mono">{mcpUrl}</code>
        </p>
      </section>

      <NewTokenForm issue={issue} mcpUrl={mcpUrl} />

      <table className="w-full text-left text-sm">
        <thead className="border-b border-zinc-200 text-xs uppercase text-zinc-500">
          <tr>
            <th className="py-2">Label</th>
            <th className="py-2">Issued</th>
            <th className="py-2">Status</th>
            <th className="py-2">Reference</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {tokens.map((t) => (
            <tr key={t.id}>
              <td className="py-2">{t.label}</td>
              <td className="py-2 font-mono text-xs">{day(t.createdAt)}</td>
              <td className="py-2">{t.revokedAt ? `Revoked ${day(t.revokedAt)}` : "Active"}</td>
              <td className="py-2 font-mono text-xs text-zinc-500">token:{t.id}</td>
              <td className="py-2 text-right">
                {t.revokedAt ? null : (
                  <form action={revoke.bind(null, t.id)}>
                    <button type="submit" className="rounded-md border border-zinc-300 px-3 py-1 text-xs">
                      Revoke
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
