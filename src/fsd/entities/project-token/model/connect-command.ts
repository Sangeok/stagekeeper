// 순수. 발급된 토큰을 사용자의 셸에 넣는 명령을 만든다.
// 토큰은 파일이 아니라 **Claude Code를 띄우는 셸의 환경변수**에 산다 — 생성기가 저장소에 쓰는
// .mcp.json에는 `${HARNESS_TOKEN}` 참조만 들어가기 때문이다(plugin/bin/harness-init.mjs).
// 값을 그 파일에 박으면 저장소를 읽을 수 있는 모두가 그 프로젝트의 보드를 쓰게 된다.
// 소유자 토큰은 변수명만 다르다(HARNESS_OWNER_TOKEN) — 생성기가 --owner로 쓰는 참조와 같아야 한다.
export type ShellKind = "powershell" | "posix";

export type ConnectCommand = { kind: ShellKind; label: string; command: string };

export const AGENT_TOKEN_VARIABLE = "HARNESS_TOKEN";
export const OWNER_TOKEN_VARIABLE = "HARNESS_OWNER_TOKEN";
// 서버 URL도 토큰과 같은 셸에 산다. 이 줄이 없으면 /harness:init이 URL을 물을 수밖에 없다 —
// 화면은 주소를 보여 주면서 셸로 옮기는 길을 주지 않았다.
export const SERVER_VARIABLE = "HARNESS_SERVER";

export function serverCommands(serverUrl: string): ConnectCommand[] {
  return [
    { kind: "powershell", label: "PowerShell", command: `$env:${SERVER_VARIABLE} = "${serverUrl}"` },
    { kind: "posix", label: "bash · zsh", command: `export ${SERVER_VARIABLE}="${serverUrl}"` },
  ];
}

export function connectCommands(token: string, variable: string = AGENT_TOKEN_VARIABLE): ConnectCommand[] {
  return [
    { kind: "powershell", label: "PowerShell", command: `$env:${variable} = "${token}"` },
    { kind: "posix", label: "bash · zsh", command: `export ${variable}="${token}"` },
  ];
}

// 플러그인 설치 명령. `/harness:init`은 플러그인이 주는 슬래시 명령이라 토큰보다 **먼저** 깔려 있어야 한다 —
// 안 깔린 세션에서는 Claude Code가 "Unknown command: /harness:init"만 내고 우리 코드는 한 줄도 돌지 않는다.
// 그래서 막을 수 있는 자리가 이 화면뿐이다. source는 공개 저장소라 머신별 경로가 필요 없고,
// stagekeeper-local은 .claude-plugin/marketplace.json의 name이다(설치 후 그 이름으로 등록된다).
export const PLUGIN_MARKETPLACE = "Sangeok/stagekeeper";
export const PLUGIN_ID = "harness@stagekeeper-local";

export const installCommands: readonly string[] = [
  `claude plugin marketplace add ${PLUGIN_MARKETPLACE}`,
  `claude plugin install ${PLUGIN_ID}`,
];
