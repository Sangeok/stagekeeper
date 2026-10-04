import type { ReactElement } from "react";
import type { TokenRow } from "@/fsd/entities/project-token";
import { TokenTable } from "@/fsd/entities/project-token/index.server";
import { NewUserTokenForm, RenameUserTokenForm } from "@/fsd/features/manage-user-token";
import type { ActionResult } from "@/fsd/shared/api/result";
import { Button } from "@/fsd/shared/ui/button";
import { Code } from "@/fsd/shared/ui/code";

export type UserTokenRow = TokenRow;

type Props = {
  mcpUrl: string;
  tokens: UserTokenRow[];
  issue: (label: string, expiresAt: string | null) => Promise<ActionResult<{ token: string }>>;
  revoke: (tokenId: string) => Promise<void>;
  rename: (tokenId: string, label: string) => Promise<ActionResult<null>>;
  at: Date;
};

export function UserTokensPage({ mcpUrl, tokens, issue, revoke, rename, at }: Props): ReactElement {
  return (
    // billing-page.tsx와 같은 컨테이너. 프로젝트 화면은 p/[slug]/layout.tsx가 주지만 이 경로는 그 밖에 있다 —
    // 없으면 본문이 창 너비 전체에 왼쪽 끝부터 깔린다.
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

      <TokenTable tokens={tokens} at={at} reference="user" headingLevel={2} empty="No tokens yet. Issue one above."
        renderName={(row) => <RenameUserTokenForm label={row.label} rename={rename.bind(null, row.id)} />}
        renderRevoke={(row) => <form action={revoke.bind(null, row.id)}><Button size="sm" type="submit">Revoke</Button></form>} />
    </main>
  );
}
