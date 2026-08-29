// 순수. config → 템플릿이 그대로 붙여 넣을 문자열들. 목록은 여기서 문자열로 만든다(render.mjs에 반복문이 없는 이유).
const bullets = (xs) => (xs.length === 0 ? "없음" : xs.map((x) => `- \`${x}\``).join("\n"));

export function buildVars(config) {
  const rows = config.workspaces.map((w) => `| \`${w.agent}\` | \`${w.path}/**\` |`).join("\n");
  return {
    project: config.project,
    board_branch: config.project.branch,
    roster_table: `| agent 값 | 담당 영역 |\n| --- | --- |\n${rows}`,
    roster_names: config.workspaces.map((w) => `\`${w.agent}\``).join("·"),
    scout: config.scout ?? { question: "" },
    release: config.release ?? { baseUrl: "", auth: "none" },
  };
}

export function buildWorkspaceVars(config, ws) {
  const others = config.workspaces.filter((w) => w.agent !== ws.agent).map((w) => `${w.path}/**`);
  return {
    ...buildVars(config),
    ws: {
      agent: ws.agent, path: ws.path,
      knowledge: ws.knowledge ?? "(없음 — 워크스페이스 지식 문서가 아직 없다. 계획서에 그 사실을 적는다)",
      verify_block: "```bash\n" + ws.verify.join("\n") + "\n```",
      verify_result_line: "검증: " + ws.verify.map((c) => `${c} <결과>`).join(" / "),
      read_only_list: bullets(ws.readOnly),
      out_of_scope_list: bullets(others),
    },
  };
}
