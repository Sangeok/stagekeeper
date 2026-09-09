import { NewOwnerTokenForm, NewTokenForm } from "@/fsd/features/manage-token";
import type { ActionResult } from "@/fsd/shared/api/result";
import { Button } from "@/fsd/shared/ui/button";
import { Code } from "@/fsd/shared/ui/code";
import { Table, Td, Th, Tr } from "@/fsd/shared/ui/table";

export type TokenRow = { id: string; label: string; createdAt: Date; revokedAt: Date | null };

type Props = {
  mcpUrl: string;
  tokens: TokenRow[];
  issue: (label: string) => Promise<ActionResult<{ token: string }>>;
  revoke: (tokenId: string) => Promise<void>;
  // 소유자 토큰 — 보는 사람 자신의 것만. ownerAllowed가 false면(Free) 발급 폼 대신 안내 한 줄.
  ownerMcpUrl: string;
  ownerTokens: TokenRow[];
  ownerAllowed: boolean;
  issueOwner: (label: string) => Promise<ActionResult<{ token: string }>>;
  revokeOwner: (tokenId: string) => Promise<void>;
};

const day = (d: Date) => d.toISOString().slice(0, 10);

function TokenTable({ tokens, revoke, reference, empty }: { tokens: TokenRow[]; revoke: (tokenId: string) => Promise<void>; reference: string; empty: string }) {
  return (
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
              {empty}
            </Td>
          </Tr>
        ) : null}
        {tokens.map((t) => (
          <Tr key={t.id} className={t.revokedAt ? "text-quiet" : undefined}>
            <Td>{t.label}</Td>
            <Td className="font-mono text-xs">{day(t.createdAt)}</Td>
            <Td>{t.revokedAt ? `Revoked ${day(t.revokedAt)}` : "Active"}</Td>
            <Td className="font-mono text-xs text-quiet">{reference}:{t.id}</Td>
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
  );
}

export function ProjectTokensPage({ mcpUrl, tokens, issue, revoke, ownerMcpUrl, ownerTokens, ownerAllowed, issueOwner, revokeOwner }: Props) {
  return (
    <>
      <section className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Tokens</h1>
        {/* "those are web only"는 이 페이지 아래에 소유자 토큰 절이 생기면서 거짓이 된다 — 승인은 Inbox 또는 소유자 토큰, 백로그 편집만 웹 전용. */}
        <p className="text-sm text-quiet">
          Agents connect with a token. An agent token can&apos;t approve or edit the backlog — approving is yours, in the
          Inbox or with an owner token below; the backlog is web only.
        </p>
        <p className="text-sm text-quiet">
          MCP server URL: <Code className="text-ink">{mcpUrl}</Code>
        </p>
      </section>

      <NewTokenForm issue={issue} mcpUrl={mcpUrl} />

      <TokenTable tokens={tokens} revoke={revoke} reference="token" empty="No tokens yet. Issue one above." />

      <section className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-tight">Owner token</h2>
        <p className="text-sm text-quiet">
          An owner token lets your own Claude Code session open gates for you. It&apos;s yours, not the project&apos;s —
          agents never get it. Send back, hold, reopen, and discard stay web only.
        </p>
        <p className="text-sm text-quiet">
          Owner MCP server URL: <Code className="text-ink">{ownerMcpUrl}</Code>
        </p>
      </section>

      {ownerAllowed ? (
        <NewOwnerTokenForm issue={issueOwner} ownerMcpUrl={ownerMcpUrl} />
      ) : (
        <p className="text-sm text-quiet">Owner tokens open on Pro. Approve in the Inbox for now.</p>
      )}

      {/* Free에는 위에 발급 폼이 없으므로 "Issue one above"를 가리킬 수 없다 — 문구를 플랜에 맞춘다. 표 자체는 남긴다: 플랜이 내려간 뒤에도 남은 토큰을 폐기할 수 있어야 한다. */}
      <TokenTable
        tokens={ownerTokens}
        revoke={revokeOwner}
        reference="owner"
        empty={ownerAllowed ? "No owner tokens yet. Issue one above." : "No owner tokens."}
      />
    </>
  );
}
