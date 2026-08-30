import { Card } from "@/fsd/shared/ui/card";
import { Code, CodeBlock } from "@/fsd/shared/ui/code";
import { CopyButton } from "@/fsd/shared/ui/copy-button";
import { connectCommands } from "../model/connect-command";

// 발급 직후 평문을 한 번만 보여 준다. 새로고침하면 사라진다 — 서비스는 해시만 저장한다.
// create-project와 manage-token 둘 다 이 화면이 필요해서 entity에 둔다(같은 layer끼리는 import할 수 없다).
export function TokenReveal({ token, mcpUrl }: { token: string; mcpUrl: string }) {
  return (
    <Card className="gap-4">
      <p className="text-sm text-quiet">This is the only time the token is shown. Stagekeeper stores a hash, not the token.</p>

      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
        <CodeBlock className="break-all whitespace-pre-wrap text-sm leading-5">{token}</CodeBlock>
        <CopyButton text={token} size="md" />
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">1. Set it in the shell you&apos;ll open the repo from</p>
        <p className="text-xs text-quiet">
          It&apos;s a shell variable, not a file in the repo. The generated <Code>.mcp.json</Code> references{" "}
          <Code>{"${HARNESS_TOKEN}"}</Code>, so committing it doesn&apos;t leak the token.
        </p>
        {connectCommands(token).map((entry) => (
          <div key={entry.kind} className="grid grid-cols-[6rem_minmax(0,1fr)_auto] items-center gap-2">
            <span className="text-xs text-quiet">{entry.label}</span>
            <CodeBlock className="truncate">{entry.command}</CodeBlock>
            <CopyButton text={entry.command} />
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">2. Open the repo from that shell and run</p>
        <CodeBlock>/harness:init</CodeBlock>
        <p className="text-xs text-quiet">
          MCP server URL: <Code>{mcpUrl}</Code>
        </p>
      </div>
    </Card>
  );
}
