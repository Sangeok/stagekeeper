import { Card } from "@/fsd/shared/ui/card";
import { Code, CodeBlock } from "@/fsd/shared/ui/code";
import { CopyButton } from "@/fsd/shared/ui/copy-button";
import { OWNER_TOKEN_VARIABLE, connectCommands } from "../model/connect-command";

// 소유자 토큰의 평문을 한 번만 보여 준다. 에이전트 토큰(TokenReveal)과 다른 점은 변수명과 다음 단계(init 재실행 — 플래그는 스킬이 변수를 보고 붙인다)뿐이다.
export function OwnerTokenReveal({ token, ownerMcpUrl }: { token: string; ownerMcpUrl: string }) {
  return (
    <Card className="gap-4">
      <p className="text-sm text-quiet">This is the only time the token is shown. Stagekeeper stores a hash, not the token.</p>

      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
        <CodeBlock className="break-all whitespace-pre-wrap text-sm leading-5">{token}</CodeBlock>
        <CopyButton text={token} size="md" />
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">1. Set it in the same shell as your agent token</p>
        <p className="text-xs text-quiet">
          It&apos;s yours, not the project&apos;s. The generated <Code>.mcp.json</Code> references{" "}
          <Code>{"${" + OWNER_TOKEN_VARIABLE + "}"}</Code>; agents never see the value.
        </p>
        {connectCommands(token, OWNER_TOKEN_VARIABLE).map((entry) => (
          <div key={entry.kind} className="grid grid-cols-[6rem_minmax(0,1fr)_auto] items-center gap-2">
            <span className="text-xs text-quiet">{entry.label}</span>
            <CodeBlock className="truncate">{entry.command}</CodeBlock>
            <CopyButton text={entry.command} />
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">2. Rerun the connection from that shell, then restart Claude Code</p>
        <CodeBlock>/harness:init</CodeBlock>
        <p className="text-xs text-quiet">
          With the variable set, init adds the <Code>harness_owner</Code> server to <Code>.mcp.json</Code>. Approve it when{" "}
          <Code>/mcp</Code> asks. Owner MCP server URL: <Code>{ownerMcpUrl}</Code>
        </p>
      </div>
    </Card>
  );
}
