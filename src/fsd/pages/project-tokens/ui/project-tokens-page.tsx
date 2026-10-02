import type { ReactElement } from "react";
import Link from "next/link";
import { isTokenActive } from "@harness/core/token-validity.mjs";
import { userTokensPath } from "@/fsd/shared/routes/user-tokens";
import { TokenUsage, TokenStatus, TokenExpiry } from "@/fsd/entities/project-token";
import { NewOwnerTokenForm, NewTokenForm, RenameTokenForm, OWNER_TOKEN_PLAN_GATE } from "@/fsd/features/manage-token";
import type { ActionResult } from "@/fsd/shared/api/result";
import { Button } from "@/fsd/shared/ui/button";
import { Code } from "@/fsd/shared/ui/code";
import { Table, Td, Th, Tr } from "@/fsd/shared/ui/table";

export type TokenRow = { id: string; label: string; createdAt: Date; revokedAt: Date | null; expiresAt: Date | null; lastUsedAt: Date | null; usageTrackingStartedAt: Date | null };

type Props = {
  issueAllowed: boolean;
  mcpUrl: string;
  tokens: TokenRow[];
  issue: (label: string, expiresAt: string | null) => Promise<ActionResult<{ token: string }>>;
  revoke: (tokenId: string) => Promise<void>;
  rename: (tokenId: string, label: string) => Promise<ActionResult<null>>;
  at: Date;
  // 소유자 토큰 — 보는 사람 자신의 것만. ownerAllowed가 false면(Free) 발급 폼 대신 안내 한 줄.
  ownerMcpUrl: string;
  ownerTokens: TokenRow[];
  ownerAllowed: boolean;
  issueOwner: (label: string, expiresAt: string | null) => Promise<ActionResult<{ token: string }>>;
  revokeOwner: (tokenId: string) => Promise<void>;
  renameOwner: (tokenId: string, label: string) => Promise<ActionResult<null>>;
};

const day = (d: Date) => d.toISOString().slice(0, 10);

function TokenTable({ tokens, revoke, rename, at, reference, empty }: { tokens: TokenRow[]; revoke: (tokenId: string) => Promise<void>; rename: Props["rename"] | null; at: Date; reference: string; empty: string }) {
  return (
    <div className="flex flex-col gap-4">
    {[true, false].map((active) => (
      <section key={String(active)} className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">{active ? "Active tokens" : "Ended tokens"}</h3>
        <Table>
          <thead>
            <tr>
              <Th>Token name</Th>
              <Th>Issued</Th>
              <Th>Last used</Th>
              <Th>Expires</Th>
              <Th>Status</Th>
              <Th>Reference</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {!tokens.some((t) => isTokenActive(t, at) === active) ? (
              <Tr>
                <Td colSpan={7} className="text-quiet">
                  {active ? tokens.length === 0 ? empty : "No active tokens." : "No ended tokens."}
                </Td>
              </Tr>
            ) : null}
            {tokens.filter((t) => isTokenActive(t, at) === active).map((t) => (
              <Tr key={t.id} className={!active ? "text-quiet" : undefined}>
                <Td>{rename ? <RenameTokenForm label={t.label} rename={rename.bind(null, t.id)} /> : t.label}</Td>
                <Td className="font-mono text-xs">{day(t.createdAt)}</Td>
                <Td><TokenUsage lastUsedAt={t.lastUsedAt} usageTrackingStartedAt={t.usageTrackingStartedAt} /></Td>
                <Td><TokenExpiry expiresAt={t.expiresAt} /></Td>
                <Td><TokenStatus revokedAt={t.revokedAt} expiresAt={t.expiresAt} at={at} />{t.revokedAt ? ` ${day(t.revokedAt)}` : null}</Td>
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
      </section>
    ))}
    </div>
  );
}

export function ProjectTokensPage({ mcpUrl, tokens, issue, revoke, rename, renameOwner, at, ownerMcpUrl, ownerTokens, ownerAllowed, issueOwner, revokeOwner, issueAllowed }: Props): ReactElement {
  return (
    <>
      <section className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Tokens</h1>
        {/* "those are web only"는 이 페이지 아래에 소유자 토큰 절이 생기면서 거짓이 된다 — 승인은 Inbox 또는 소유자 토큰, 백로그 편집만 웹 전용. */}
        <p className="text-sm text-quiet">
          Agents connect with a token. An agent token can&apos;t approve gates or edit and remove backlog items — approving is yours, in the Inbox or with an owner token below. feature-scout can add up to three backlog items a run.
        </p>
        <p className="text-sm text-quiet">Create separate tokens for different devices or uses. You can revoke each one independently.</p>
        <p className="text-xs text-quiet">Usage reflects recorded authentication, not task completion.</p>
        <p className="text-sm text-quiet">
          MCP server URL: <Code className="text-ink">{mcpUrl}</Code>
        </p>
      </section>

      <p className="text-sm text-quiet">A project token connects agents to this project. For your own machine across multiple projects, use a <Link href={userTokensPath()} className="underline underline-offset-2">user token</Link>.</p>

      {issueAllowed ? <NewTokenForm issue={issue} mcpUrl={mcpUrl} /> : null}

      <TokenTable tokens={tokens} revoke={revoke} rename={issueAllowed ? rename : null} at={at} reference="token" empty={issueAllowed ? "No tokens yet. Issue one above." : "No tokens yet."} />

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
      ) : issueAllowed ? (
        <p className="text-sm text-quiet">{OWNER_TOKEN_PLAN_GATE}</p>
      ) : null}

      {/* Free에는 위에 발급 폼이 없으므로 "Issue one above"를 가리킬 수 없다 — 문구를 플랜에 맞춘다. 표 자체는 남긴다: 플랜이 내려간 뒤에도 남은 토큰을 폐기할 수 있어야 한다. */}
      <TokenTable
        tokens={ownerTokens}
        revoke={revokeOwner}
        rename={issueAllowed ? renameOwner : null}
        at={at}
        reference="owner"
        empty={ownerAllowed ? "No owner tokens yet. Issue one above." : "No owner tokens."}
      />
    </>
  );
}
