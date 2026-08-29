"use client";

// 발급 직후 평문을 한 번만 보여 준다. 새로고침하면 사라진다.
export function TokenReveal({ token, mcpUrl }: { token: string; mcpUrl: string }) {
  return (
    <div className="space-y-3 rounded-md border border-zinc-300 p-4">
      <p className="text-sm text-zinc-600">
        이 토큰은 <strong>지금 한 번만</strong> 보입니다. 서비스는 해시만 저장합니다.
      </p>
      <code className="block break-all rounded-md bg-zinc-100 p-3 font-mono text-sm">{token}</code>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-zinc-700">
        <li>이 값을 환경변수 <code className="font-mono">HARNESS_TOKEN</code>으로 저장합니다.</li>
        <li>MCP 서버 URL은 <code className="font-mono">{mcpUrl}</code>입니다.</li>
        <li>연결할 저장소에서 <code className="font-mono">/harness:init</code>을 실행합니다.</li>
      </ol>
    </div>
  );
}
