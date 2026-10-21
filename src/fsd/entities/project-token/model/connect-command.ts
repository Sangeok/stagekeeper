import { PLUGIN_ID, PLUGIN_MARKETPLACE } from "@/fsd/shared/config/plugin-install";

export type ShellKind = "powershell" | "posix" | "gitbash";

export type ConnectCommand = { kind: ShellKind; label: string; command: string };

export const AGENT_TOKEN_VARIABLE = "HARNESS_TOKEN";
export const OWNER_TOKEN_VARIABLE = "HARNESS_OWNER_TOKEN";
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

export function profileLine(token: string, variable: string = AGENT_TOKEN_VARIABLE): string {
  return `export ${variable}="${token}"`;
}

export const codexInstallCommands: readonly string[] = [
  `codex plugin marketplace add ${PLUGIN_MARKETPLACE}`,
  `codex plugin add ${PLUGIN_ID}`,
];

export function codexMcpCommand(mcpUrl: string): string {
  return codexConnectionCommand(mcpUrl, "harness", AGENT_TOKEN_VARIABLE);
}

export function codexOwnerMcpCommand(ownerMcpUrl: string): string {
  return codexConnectionCommand(ownerMcpUrl, "harness_owner", OWNER_TOKEN_VARIABLE);
}

function codexConnectionCommand(mcpUrl: string, name: string, variable: string): string {
  const url = new URL(mcpUrl);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error("Invalid MCP URL");
  const quoted = `'${url.href.replaceAll("'", "%27")}'`;
  return `codex mcp add ${name} --url ${quoted} --bearer-token-env-var ${variable}`;
}
