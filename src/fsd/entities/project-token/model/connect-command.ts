// 순수. 발급된 토큰을 사용자의 셸에 넣는 명령을 만든다.
// 토큰은 파일이 아니라 **Claude Code를 띄우는 셸의 환경변수**에 산다 — MCP 등록에는
// `${HARNESS_TOKEN}` 참조만 들어가기 때문이다. 값을 설정에 박으면 그 설정을 읽을 수 있는 모두가
// 그 프로젝트의 보드를 쓰게 된다.
// 서버는 이제 저장소의 .mcp.json이 아니라 **사용자 범위에 머신당 1회** 등록된다(스킬이 수행한다) —
// 그래도 참조만 저장된다는 규칙은 같다. 소유자 토큰은 변수명만 다르다(HARNESS_OWNER_TOKEN).
//
// 토큰을 **어디에 두느냐는 종류가 정한다**(product-copy.md §9의 근거). 변수는 머신에 하나인데 hs_는
// 저장소마다 값이 다르다 — 머신 전역에 저장하면 두 번째 저장소가 첫 번째를 덮어쓴다. 그래서 hs_·ho_는
// 그 터미널에만 두고(connectCommands), 저장소를 가로지르는 hu_만 영구 저장한다(saveCommands).
export type ShellKind = "powershell" | "posix" | "gitbash";

export type ConnectCommand = { kind: ShellKind; label: string; command: string };

export const AGENT_TOKEN_VARIABLE = "HARNESS_TOKEN";
export const OWNER_TOKEN_VARIABLE = "HARNESS_OWNER_TOKEN";
// 접두는 packages/core/token.mjs의 TOKEN_KINDS.user와 같다. 그 모듈은 node:crypto를 끌고 와서 클라이언트
// 번들에 넣을 수 없다 — 여기서는 문자열로 적고 connect-command.test.ts가 둘을 묶는다.
const USER_TOKEN_PREFIX = "hu_";

export type TokenKind = "project" | "user";

export function tokenKind(token: string): TokenKind {
  return token.startsWith(USER_TOKEN_PREFIX) ? "user" : "project";
}

export function connectCommands(token: string, variable: string = AGENT_TOKEN_VARIABLE): ConnectCommand[] {
  return [
    { kind: "powershell", label: "PowerShell", command: `$env:${variable} = "${token}"` },
    { kind: "posix", label: "bash / zsh", command: `export ${variable}="${token}"` },
  ];
}

// hu_를 머신에 한 번 저장한다. **값을 싣지 않고 입력을 받는다** — 그래서 인자가 없고, 셸 히스토리에 남는 것은
// 이 줄뿐이다. 영구 저장과 함께 지금 셸에도 넣으므로 새 터미널을 열 필요가 없다.
// 두 줄 모두 2026-09-22에 더미 변수로 저장·현재 셸 반영을 실측했다(입력 프롬프트 자체는 비대화형이라 못 쳤다).
export function saveCommands(variable: string = AGENT_TOKEN_VARIABLE): ConnectCommand[] {
  return [
    {
      kind: "powershell",
      label: "PowerShell",
      command: `$t = Read-Host "${variable}" -AsSecureString; $p = [Net.NetworkCredential]::new("", $t).Password; [Environment]::SetEnvironmentVariable("${variable}", $p, "User"); $env:${variable} = $p`,
    },
    {
      kind: "gitbash",
      label: "Git Bash",
      command: `read -rsp "${variable}: " t && setx ${variable} "$t" >/dev/null && export ${variable}="$t"; unset t`,
    },
  ];
}

// macOS·Linux는 셸 프로필에 적는다. 프롬프트가 아니라 **파일에** 들어가는 줄이라 값을 싣는다 —
// 터미널에 치면 히스토리에 남으므로 화면이 "in an editor"라고 말한다. 이 머신(Windows)에서는 검증하지 못했다.
export function profileLine(token: string, variable: string = AGENT_TOKEN_VARIABLE): string {
  return `export ${variable}="${token}"`;
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
