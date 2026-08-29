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
        이 토큰은 <strong>지금 한 번만</strong> 보입니다. 서비스는 해시만 저장합니다.
      </p>

      <div className="flex items-start gap-2">
        <code className="flex-1 break-all rounded-md bg-zinc-100 p-3 font-mono text-sm">{token}</code>
        <button
          type="button"
          onClick={() => copy("token", token)}
          className="shrink-0 rounded-md border border-zinc-300 px-3 py-2 text-xs"
        >
          {copied === "token" ? "복사됨" : "복사"}
        </button>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">1. 연결할 저장소를 여는 셸에 넣습니다</p>
        <p className="text-xs text-zinc-500">
          저장소 파일이 아니라 셸 환경변수입니다. 생성될 <code className="font-mono">.mcp.json</code>은 값이 아니라{" "}
          <code className="font-mono">{"${HARNESS_TOKEN}"}</code> 참조만 담기 때문에, 커밋해도 토큰이 새지 않습니다.
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
              {copied === entry.kind ? "복사됨" : "복사"}
            </button>
          </div>
        ))}
      </div>

      <div className="space-y-1">
        <p className="text-sm font-medium">2. 그 셸에서 저장소를 열고 연결합니다</p>
        <code className="block rounded-md bg-zinc-100 px-3 py-2 font-mono text-xs">/harness:init</code>
        <p className="text-xs text-zinc-500">
          MCP 서버 URL은 <code className="font-mono">{mcpUrl}</code>입니다.
        </p>
      </div>
    </div>
  );
}
