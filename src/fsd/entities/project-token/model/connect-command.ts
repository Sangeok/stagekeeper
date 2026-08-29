// 순수. 발급된 토큰을 사용자의 셸에 넣는 명령을 만든다.
// 토큰은 파일이 아니라 **Claude Code를 띄우는 셸의 환경변수**에 산다 — 생성기가 저장소에 쓰는
// .mcp.json에는 `${HARNESS_TOKEN}` 참조만 들어가기 때문이다(plugin/bin/harness-init.mjs).
// 값을 그 파일에 박으면 저장소를 읽을 수 있는 모두가 그 프로젝트의 보드를 쓰게 된다.
export type ShellKind = "powershell" | "posix";

export type ConnectCommand = { kind: ShellKind; label: string; command: string };

export function connectCommands(token: string): ConnectCommand[] {
  return [
    { kind: "powershell", label: "PowerShell", command: `$env:HARNESS_TOKEN = "${token}"` },
    { kind: "posix", label: "bash · zsh", command: `export HARNESS_TOKEN="${token}"` },
  ];
}
