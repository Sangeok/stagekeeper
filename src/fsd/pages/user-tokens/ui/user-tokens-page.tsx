import type { ReactElement } from "react";
import { isTokenActive } from "@harness/core/token-validity.mjs";
import { TokenUsage, TokenStatus, TokenExpiry } from "@/fsd/entities/project-token";
import { NewUserTokenForm, RenameUserTokenForm } from "@/fsd/features/manage-user-token";
import type { ActionResult } from "@/fsd/shared/api/result";
import { Button } from "@/fsd/shared/ui/button";
import { Code } from "@/fsd/shared/ui/code";
import { Table, Td, Th, Tr } from "@/fsd/shared/ui/table";

export type UserTokenRow = { id: string; label: string; createdAt: Date; revokedAt: Date | null; expiresAt: Date | null; lastUsedAt: Date | null; usageTrackingStartedAt: Date | null };

type Props = {
  mcpUrl: string;
  tokens: UserTokenRow[];
  issue: (label: string, expiresAt: string | null) => Promise<ActionResult<{ token: string }>>;
  revoke: (tokenId: string) => Promise<void>;
  rename: (tokenId: string, label: string) => Promise<ActionResult<null>>;
  at: Date;
};

const day = (d: Date) => d.toISOString().slice(0, 10);

// project-tokens의 표와 같은 모양이지만 그쪽 파일 안에 있는 것을 가져오지 않는다 —
// 같은 layer의 다른 slice는 import할 수 없다(fsd).
export function UserTokensPage({ mcpUrl, tokens, issue, revoke, rename, at }: Props): ReactElement {
  return (
    // billing-page.tsx와 같은 컨테이너. 프로젝트 화면은 p/[slug]/layout.tsx가 주지만 이 경로는 그 밖에 있다 —
    // 없으면 본문이 창 너비 전체에 왼쪽 끝부터 깔린다(2026-09-22 렌더 확인에서 발견, dev에도 있던 것).
    <main className="mx-auto flex w-full max-w-[800px] flex-col gap-8 px-5 pt-9 pb-14">
      <section className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Tokens</h1>
        <p className="text-sm text-quiet">
          A user token connects every repository you own from one shell. It says who you are, not which project — the
          project comes from <Code className="text-ink">harness.json</Code>&apos;s{" "}
          <Code className="text-ink">project.slug</Code>. You save it once on each machine, and it works until you
          revoke it or its chosen expiry is reached.
        </p>
        <p className="text-sm text-quiet">
          Already connected a repository? Rerun <Code className="text-ink">/harness:init</Code> once there before you use
          this token — an older <Code className="text-ink">harness.json</Code> has no slug, and without one there is
          nothing to name the project with.
        </p>
        <p className="text-sm text-quiet">Create separate tokens for different devices or uses. You can revoke each one independently.</p>
        <p className="text-xs text-quiet">Usage reflects recorded authentication, not task completion.</p>
        <p className="text-sm text-quiet">
          MCP server URL: <Code className="text-ink">{mcpUrl}</Code>
        </p>
      </section>

      <p className="text-sm text-quiet">A user token does not replace an owner token for gate approvals.</p>

      <NewUserTokenForm issue={issue} mcpUrl={mcpUrl} />

      {[true, false].map((active) => (
        <section key={String(active)} className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">{active ? "Active tokens" : "Ended tokens"}</h2>
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
                    {active ? tokens.length === 0 ? "No tokens yet. Issue one above." : "No active tokens." : "No ended tokens."}
                  </Td>
                </Tr>
              ) : null}
              {tokens.filter((t) => isTokenActive(t, at) === active).map((t) => (
                <Tr key={t.id} className={!active ? "text-quiet" : undefined}>
                  <Td><RenameUserTokenForm label={t.label} rename={rename.bind(null, t.id)} /></Td>
                  <Td className="font-mono text-xs">{day(t.createdAt)}</Td>
                  <Td><TokenUsage lastUsedAt={t.lastUsedAt} usageTrackingStartedAt={t.usageTrackingStartedAt} /></Td>
                  <Td><TokenExpiry expiresAt={t.expiresAt} /></Td>
                  <Td><TokenStatus revokedAt={t.revokedAt} expiresAt={t.expiresAt} at={at} />{t.revokedAt ? ` ${day(t.revokedAt)}` : null}</Td>
                  <Td className="font-mono text-xs text-quiet">user:{t.id}</Td>
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
    </main>
  );
}
