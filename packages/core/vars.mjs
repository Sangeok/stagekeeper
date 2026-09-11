// 순수. config → 템플릿이 그대로 붙여 넣을 문자열들. 목록은 여기서 문자열로 만든다(render.mjs에 반복문이 없는 이유).
// 사용자·에이전트에게 보이는 문자열은 영문이다(docs/conventions/product-copy.md).
const bullets = (xs) => (xs.length === 0 ? "none" : xs.map((x) => `- \`${x}\``).join("\n"));

export function buildVars(config) {
  const rows = config.workspaces.map((w) => `| \`${w.agent}\` | \`${w.path}/**\` |`).join("\n");
  return {
    project: config.project,
    board_branch: config.project.branch,
    roster_table: `| agent | owns |\n| --- | --- |\n${rows}`,
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
      // 옛 템플릿 호환용. 새 템플릿은 knowledge_line을 쓴다 — 아래 이유.
      knowledge: ws.knowledge ?? "(none — this workspace has no knowledge doc yet. Say so in the plan)",
      // 지식 문서는 없을 수 있다. 템플릿이 값을 백틱으로 감싸면 없을 때 그 문장이 파일 이름처럼 읽혀,
      // "Read `(none — this workspace has no knowledge doc yet...)`"가 된다(실측). 그래서 값이 문장을
      // 통째로 들고 백틱까지 안에서 붙인다. render.mjs에 조건이 없으므로 분기는 여기서 끝난다.
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
