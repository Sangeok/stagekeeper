import { NewTokenForm } from "@/fsd/features/manage-token";
import { Button } from "@/fsd/shared/ui/button";
import { Code } from "@/fsd/shared/ui/code";
import { Table, Td, Th, Tr } from "@/fsd/shared/ui/table";

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
    <>
      <section className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Tokens</h1>
        <p className="text-sm text-quiet">
          Agents connect with a token. A token can&apos;t approve or edit the backlog — those are web only.
        </p>
        <p className="text-sm text-quiet">
          MCP server URL: <Code className="text-ink">{mcpUrl}</Code>
        </p>
      </section>

      <NewTokenForm issue={issue} mcpUrl={mcpUrl} />

      <Table>
        <thead>
          <tr>
            <Th>Label</Th>
            <Th>Issued</Th>
            <Th>Status</Th>
            <Th>Reference</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {tokens.length === 0 ? (
            <Tr>
              <Td colSpan={5} className="text-quiet">
                No tokens yet. Issue one above.
              </Td>
            </Tr>
          ) : null}
          {tokens.map((t) => (
            <Tr key={t.id} className={t.revokedAt ? "text-quiet" : undefined}>
              <Td>{t.label}</Td>
              <Td className="font-mono text-xs">{day(t.createdAt)}</Td>
              <Td>{t.revokedAt ? `Revoked ${day(t.revokedAt)}` : "Active"}</Td>
              <Td className="font-mono text-xs text-quiet">token:{t.id}</Td>
              <Td className="text-right">
                {t.revokedAt ? null : (
                  <form action={revoke.bind(null, t.id)}>
                    <Button size="sm" type="submit">
                      Revoke
                    </Button>
                  </form>
                )}
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </>
  );
}
