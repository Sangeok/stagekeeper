"use client";

import { useState, type ReactElement } from "react";
import { CLIENTS, clientRuntime, parseClient } from "@harness/core/client-runtime.mjs";

import { Card } from "@/fsd/shared/ui/card";
import { Code, CodeBlock } from "@/fsd/shared/ui/code";
import { CopyButton } from "@/fsd/shared/ui/copy-button";
import { RuntimeClientChoice } from "@/fsd/shared/ui/runtime-client-choice";
import { OWNER_TOKEN_VARIABLE, codexOwnerMcpCommand, connectCommands } from "../model/connect-command";

type RuntimeClient = NonNullable<Parameters<typeof clientRuntime>[0]>;
const OPTIONS = CLIENTS.map(parseClient).map(value => ({ value, label: value === "claude" ? "Claude Code" : "Codex" }));

// 문장은 product-copy.md §9의 잠금 블록(owner-token-reveal)에서 온다 — token-reveal.test.ts가 묶는다.
export function OwnerTokenReveal({ token, ownerMcpUrl }: { token: string; ownerMcpUrl: string }): ReactElement {
  return <OwnerTokenRevealContent key={`${token}:${ownerMcpUrl}`} token={token} ownerMcpUrl={ownerMcpUrl} />;
}

function OwnerTokenRevealContent({ token, ownerMcpUrl }: { token: string; ownerMcpUrl: string }): ReactElement {
  const [client, setClient] = useState<RuntimeClient>("claude");
  return <OwnerTokenRevealView token={token} ownerMcpUrl={ownerMcpUrl} client={client} onClientChange={setClient} />;
}

export function OwnerTokenRevealView({ token, ownerMcpUrl, client, onClientChange }: { token: string; ownerMcpUrl: string; client: RuntimeClient; onClientChange: (client: RuntimeClient) => void }): ReactElement {
  const clientName = client === "claude" ? "Claude Code" : "Codex";
  const ownerCommand = client === "codex" ? codexOwnerMcpCommand(ownerMcpUrl) : null;
  return (
    <Card className="gap-4">
      <RuntimeClientChoice value={client} options={OPTIONS} onChange={onClientChange} />
      <p className="text-sm text-quiet">This is the only time the token is shown. Stagekeeper stores a hash, not the token.</p>
      <p className="text-xs text-quiet">This token stays valid until you revoke it or its chosen expiry is reached. Restarting a terminal or {clientName} does not expire it.</p>
      <p className="text-xs text-quiet">Save the token in a secure secret store if you want to reuse it. Do not paste it into a chat or commit it to your repository.</p>
      <p className="text-xs text-quiet">If you did not save the token, issue a new one and revoke the old token when you no longer use it.</p>

      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
        <CodeBlock className="break-all whitespace-pre-wrap text-sm leading-5">{token}</CodeBlock>
        <CopyButton text={token} size="md" />
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">1. Set it in the same shell as your agent token</p>
        <p className="text-xs text-quiet">
          It&apos;s yours, not the project&apos;s. The MCP registration stores only a{" "}
          <Code>{"${" + OWNER_TOKEN_VARIABLE + "}"}</Code> reference; agents never see the value.
        </p>
        {connectCommands(token, OWNER_TOKEN_VARIABLE).map((entry) => (
          <div key={entry.kind} className="grid grid-cols-[6rem_minmax(0,1fr)_auto] items-center gap-2">
            <span className="text-xs text-quiet">{entry.label}</span>
            <CodeBlock className="truncate">{entry.command}</CodeBlock>
            <CopyButton text={entry.command} />
          </div>
        ))}
        <p className="text-xs text-quiet">This environment variable lasts only in this terminal. In a new terminal, set the same token again from your secure storage before starting {clientName}.</p>
      </div>

      {ownerCommand === null ? <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">2. Rerun the connection from that shell, then restart Claude Code</p>
        <CodeBlock>/harness:init</CodeBlock>
        <p className="text-xs text-quiet">
          With the variable set, init registers a <Code>harness_owner</Code> server once per machine. There is no approval
          prompt — user-scope servers load on their own.
        </p>
        <p className="text-xs text-quiet">
          Owner MCP server URL: <Code>{ownerMcpUrl}</Code>
        </p>
      </div> : <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">2. Register the owner connection from that shell, then restart Codex</p>
        <p className="text-xs text-quiet">Run this in the terminal that will start Codex. It registers only the owner connection and stores the environment variable name, never the token value.</p>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <CodeBlock className="break-all whitespace-pre-wrap">{ownerCommand}</CodeBlock>
          <CopyButton text={ownerCommand} />
        </div>
        <p className="text-xs text-quiet">Owner approvals use this connection in the main session. Independent role sessions do not load it.</p>
      </div>}
    </Card>
  );
}
