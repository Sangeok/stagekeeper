import { NewUserTokenForm } from "@/fsd/features/manage-user-token";
import type { ActionResult } from "@/fsd/shared/api/result";
import { Button } from "@/fsd/shared/ui/button";
import { Code } from "@/fsd/shared/ui/code";
import { Table, Td, Th, Tr } from "@/fsd/shared/ui/table";

export type UserTokenRow = { id: string; label: string; createdAt: Date; revokedAt: Date | null };

type Props = {
  mcpUrl: string;
  tokens: UserTokenRow[];
  issue: (label: string) => Promise<ActionResult<{ token: string }>>;
  revoke: (tokenId: string) => Promise<void>;
};

const day = (d: Date) => d.toISOString().slice(0, 10);

// project-tokens의 표와 같은 모양이지만 그쪽 파일 안에 있는 것을 가져오지 않는다 —
// 같은 layer의 다른 slice는 import할 수 없고(fsd), 그 화면은 이번 변경이 건드리지 않는다.
export function UserTokensPage({ mcpUrl, tokens, issue, revoke }: Props) {
  return (
    <>
      <section className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Tokens</h1>
        <p className="text-sm text-quiet">
          A user token connects every repository you own from one shell. It says who you are, not which project — the
          project comes from <Code className="text-ink">harness.json</Code>&apos;s{" "}
          <Code className="text-ink">project.slug</Code>.
        </p>
        <p className="text-sm text-quiet">
          Already connected a repository? Rerun <Code className="text-ink">/harness:init</Code> once there before you use
          this token — an older <Code className="text-ink">harness.json</Code> has no slug, and without one there is
          nothing to name the project with.
        </p>
        <p className="text-sm text-quiet">
          MCP server URL: <Code className="text-ink">{mcpUrl}</Code>
        </p>
      </section>

      <NewUserTokenForm issue={issue} mcpUrl={mcpUrl} />

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
    </>
  );
}
