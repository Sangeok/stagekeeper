const bullets = (xs) => (xs.length === 0 ? "none" : xs.map((x) => `- \`${x}\``).join("\n"));
import { clientRuntime } from "../execution/client-runtime.mjs";

export const DEFAULT_SCOUT_QUESTION = "What should change next in this repository — a defect you can point to in the code, or a feature its users need — and what is the evidence?";

export function buildVars(config, client = "claude") {
  const rows = config.workspaces.map((w) => `| \`${w.agent}\` | \`${w.path}/**\` |`).join("\n");
  return {
    runtime: clientRuntime(client),
    project: { owner: config.project.owner, repo: config.project.repo, branch: config.project.branch, name: config.project.name },
    board_branch: config.project.branch,
    roster_table: `| agent | owns |\n| --- | --- |\n${rows}`,
    roster_names: config.workspaces.map((w) => `\`${w.agent}\``).join("·"),
    scout: config.scout ?? { question: DEFAULT_SCOUT_QUESTION },
    release: config.release ?? { baseUrl: "", auth: "none" },
  };
}

export function buildReportTable(agents) {
  if (agents.length === 0) return "none";
  const rows = agents.map((a) => `| \`${a.name}\` | ${a.description} |`).join("\n");
  return `| agent | does |\n| --- | --- |\n${rows}`;
}

export function templateDescription(body, name) {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(body);
  const match = frontmatter && /^description:\s*(.+?)\s*$/m.exec(frontmatter[1]);
  if (!match) throw new Error(`${name}: no description in frontmatter`);
  return match[1];
}

export function buildWorkspaceVars(config, ws, client = "claude") {
  const others = config.workspaces.filter((w) => w.agent !== ws.agent).map((w) => `${w.path}/**`);
  return {
    ...buildVars(config, client),
    ws: {
      agent: ws.agent, path: ws.path,
      knowledge: ws.knowledge ?? "(none — this workspace has no knowledge doc yet. Say so in the plan)",
      knowledge_line: ws.knowledge
        ? `Your workspace knowledge doc is \`${ws.knowledge}\` — read it before you write.`
        : "This workspace has no knowledge doc. Say so in the plan rather than inventing its conventions.",
      verify_block: "```bash\n" + ws.verify.join("\n") + "\n```",
      verify_result_line: "Verification: " + ws.verify.map((c) => `${c} <result>`).join(" / "),
      read_only_list: bullets(ws.readOnly),
      out_of_scope_list: bullets(others),
    },
  };
}
