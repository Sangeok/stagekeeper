import Link from "next/link";

import { cn } from "@/fsd/shared/lib/class-name";
import { userTokensPath } from "@/fsd/shared/routes/user-tokens";
import { Card } from "@/fsd/shared/ui/card";
import { Code, CodeBlock } from "@/fsd/shared/ui/code";
import { CopyButton } from "@/fsd/shared/ui/copy-button";
import { type ConnectCommand, connectCommands, installCommands, profileLine, saveCommands, tokenKind } from "../model/connect-command";

// 발급 직후 평문을 한 번만 보여 준다. 새로고침하면 사라진다 — 서비스는 해시만 저장한다.
// create-project·manage-token·manage-user-token 셋이 이 화면을 쓴다(같은 layer끼리는 import할 수 없어 entity에 둔다).
//
// 문장은 전부 product-copy.md §9의 잠금 블록에서 온다(token-reveal.test.ts가 묶는다) — 1·4단계는 공통,
// 2·3단계는 토큰 종류가 정한다. 안내는 /harness:init에서 끝난다: 재시작·연결 확인은 스킬이 그 자리에서 말한다.
export function TokenReveal({ token, mcpUrl }: { token: string; mcpUrl: string }) {
  const isUserToken = tokenKind(token) === "user";
  return (
    <Card className="gap-4">
      <p className="text-sm text-quiet">This is the only time the token is shown. Stagekeeper stores a hash, not the token.</p>

      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
        <CodeBlock className="break-all whitespace-pre-wrap text-sm leading-5">{token}</CodeBlock>
        <CopyButton text={token} size="md" />
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">1. Install the Stagekeeper plugin in Claude Code</p>
        <p className="text-xs text-quiet">
          <Code>/harness:init</Code> comes from the plugin. Install it once — it stays available in every repository.
        </p>
        {installCommands.map((command) => (
          <div key={command} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
            <CodeBlock className="truncate">{command}</CodeBlock>
            <CopyButton text={command} />
          </div>
        ))}
        <p className="text-xs text-quiet">
          Already installed? <Code>claude plugin list</Code> shows <Code>harness</Code>.
        </p>
      </div>

      {isUserToken ? <SaveUserToken token={token} /> : <SetProjectToken token={token} />}

      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">3. Start Claude Code in this repository</p>
        <p className="text-xs text-quiet">
          {isUserToken
            ? "Change to the repository directory and start Claude Code."
            : "From the same terminal, change to the repository directory and start Claude Code."}
        </p>
        <CodeBlock>claude</CodeBlock>
      </div>

      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">4. Enter this in the Claude Code prompt</p>
        <CodeBlock>/harness:init</CodeBlock>
        <p className="text-xs text-quiet">
          This is a Claude Code slash command, not a terminal command. It connects the repository and tells you when to
          restart Claude Code.
        </p>
        <p className="text-xs text-quiet">
          If it asks for the server address, give it this: <Code>{mcpUrl}</Code>
        </p>
      </div>
    </Card>
  );
}

// hs_ — 그 터미널에만 둔다. 변수는 머신에 하나인데 hs_는 저장소마다 달라서, 전역에 저장하면 다른 저장소의 토큰을 덮어쓴다.
function SetProjectToken({ token }: { token: string }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">2. Set the token in the terminal that will start Claude Code</p>
      <p className="text-xs text-quiet">
        Claude Code reads this environment variable when it starts. A repository <Code>.env</Code> file is not loaded for
        this connection. The MCP registration stores only a <Code>{"${HARNESS_TOKEN}"}</Code> reference, never the value.
      </p>
      {connectCommands(token).map((entry) => (
        <CommandRow key={entry.kind} entry={entry} />
      ))}
      <p className="text-xs text-quiet">
        This lasts only in this terminal. A new terminal needs the token again, and it can&apos;t be shown again — issue
        another on the Tokens tab, or use a{" "}
        <Link href={userTokensPath()} className="underline underline-offset-2">
          user token
        </Link>{" "}
        to set one once for every repository.
      </p>
    </div>
  );
}

// hu_ — 머신에 한 번 저장한다. 명령은 값을 싣지 않고 입력을 받으므로 길어도 잘라 보이지 않는다:
// 비밀을 다루는 줄은 무엇을 실행하는지 다 보여야 한다.
function SaveUserToken({ token }: { token: string }) {
  const line = profileLine(token);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">2. Save the token once for this machine</p>
      <p className="text-xs text-quiet">
        Copy the command for your shell and run it. When it asks, copy the token above and paste it, then press Enter.
        The token stays hidden as you paste.
      </p>
      <p className="text-xs text-quiet">
        The token is saved to your user environment variables as plain text, so every new terminal has it. It stays out
        of your shell history. The MCP registration stores only a <Code>{"${HARNESS_TOKEN}"}</Code> reference, never the
        value. A repository <Code>.env</Code> file is not loaded for this connection.
      </p>
      {saveCommands().map((entry) => (
        <CommandRow key={entry.kind} entry={entry} wrap />
      ))}
      <p className="text-xs text-quiet">
        macOS · Linux — add this line to <Code>~/.zshrc</Code> or <Code>~/.bashrc</Code> in an editor, then open a new
        terminal.
      </p>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <CodeBlock className="truncate">{line}</CodeBlock>
        <CopyButton text={line} />
      </div>
    </div>
  );
}

function CommandRow({ entry, wrap = false }: { entry: ConnectCommand; wrap?: boolean }) {
  return (
    <div className={cn("grid grid-cols-[6rem_minmax(0,1fr)_auto] gap-2", wrap ? "items-start" : "items-center")}>
      <span className="text-xs text-quiet">{entry.label}</span>
      <CodeBlock className={wrap ? "break-words whitespace-pre-wrap" : "truncate"}>{entry.command}</CodeBlock>
      <CopyButton text={entry.command} />
    </div>
  );
}
