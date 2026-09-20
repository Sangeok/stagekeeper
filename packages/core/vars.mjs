// 순수. config → 템플릿이 그대로 붙여 넣을 문자열들. 목록은 여기서 문자열로 만든다(render.mjs에 반복문이 없는 이유).
// 사용자·에이전트에게 보이는 문자열은 영문이다(docs/conventions/product-copy.md).
const bullets = (xs) => (xs.length === 0 ? "none" : xs.map((x) => `- \`${x}\``).join("\n"));

export function buildVars(config) {
  const rows = config.workspaces.map((w) => `| \`${w.agent}\` | \`${w.path}/**\` |`).join("\n");
  return {
    // config.project를 통째로 넘기지 않는다 — 넘기면 여기에 더해지는 필드가 전부 템플릿 변수가 된다.
    // project.slug가 그 예다: 연결용 값(어느 프로젝트에 말을 거느냐)이지 에이전트가 읽을 내용이 아니고,
    // 서버 쪽 serverVars(src/server/agents/vars.ts)는 DB 행에서 이 네 개만 만든다. 둘이 어긋나면
    // 스텁(클라이언트 렌더)과 단계 본문(서버 렌더)이 다른 값을 본다.
    project: { owner: config.project.owner, repo: config.project.repo, branch: config.project.branch, name: config.project.name },
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
