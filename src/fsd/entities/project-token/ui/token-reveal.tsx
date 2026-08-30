"use client";
import { useState } from "react";
import { connectCommands } from "../model/connect-command";

// 발급 직후 평문을 한 번만 보여 준다. 새로고침하면 사라진다 — 서비스는 해시만 저장한다.
// create-project와 manage-token 둘 다 이 화면이 필요해서 entity에 둔다(같은 layer끼리는 import할 수 없다).
export function TokenReveal({ token, mcpUrl }: { token: string; mcpUrl: string }) {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
    } catch {
      setCopied(null); // 클립보드를 못 쓰는 브라우저에서는 직접 선택해 복사한다
    }
  };

  return (
    <div className="space-y-4 rounded-md border border-zinc-300 p-4">
      <p className="text-sm text-zinc-600">
        This is the only time the token is shown. Stagekeeper stores a hash, not the token.
      </p>

      <div className="flex items-start gap-2">
        <code className="flex-1 break-all rounded-md bg-zinc-100 p-3 font-mono text-sm">{token}</code>
        <button
          type="button"
          onClick={() => copy("token", token)}
          className="shrink-0 rounded-md border border-zinc-300 px-3 py-2 text-xs"
        >
          {copied === "token" ? "Copied" : "Copy"}
        </button>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">1. Set it in the shell you&apos;ll open the repo from</p>
        <p className="text-xs text-zinc-500">
          It&apos;s a shell variable, not a file in the repo. The generated <code className="font-mono">.mcp.json</code>{" "}
          references <code className="font-mono">{"${HARNESS_TOKEN}"}</code>, so committing it doesn&apos;t leak the token.
        </p>
        {connectCommands(token).map((entry) => (
          <div key={entry.kind} className="flex items-center gap-2">
            <span className="w-24 shrink-0 text-xs text-zinc-500">{entry.label}</span>
            <code className="flex-1 truncate rounded-md bg-zinc-100 px-3 py-2 font-mono text-xs">{entry.command}</code>
            <button
              type="button"
              onClick={() => copy(entry.kind, entry.command)}
              className="shrink-0 rounded-md border border-zinc-300 px-3 py-1.5 text-xs"
            >
              {copied === entry.kind ? "Copied" : "Copy"}
            </button>
          </div>
        ))}
      </div>

      <div className="space-y-1">
        <p className="text-sm font-medium">2. Open the repo from that shell and run</p>
        <code className="block rounded-md bg-zinc-100 px-3 py-2 font-mono text-xs">/harness:init</code>
        <p className="text-xs text-zinc-500">
          MCP server URL: <code className="font-mono">{mcpUrl}</code>
        </p>
      </div>
    </div>
  );
}
