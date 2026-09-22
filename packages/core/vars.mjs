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

// 런북의 "Report only" 표. 행은 **실제로 내려간** 보고 에이전트만이다 — 플랜 밖 에이전트는 서버가 내려주지
// 않고(deliver.mjs), scout 없는 저장소의 feature-scout는 생성기가 쓰지 않는다(harness-init.mjs). 파일이 없는
// 에이전트가 표에 있으면 런북이 없는 에이전트를 시킨다 — 2026-09-22 mathgic 실사용에서 free 런북이 하드코딩된
// doc-auditor·plan-verifier 행을 들고 있었다. 문구는 각 에이전트 파일의 frontmatter description이다: 런북이
// 따로 설명하면 둘이 어긋난다. buildVars에 넣지 않는다 — 입력이 config가 아니라 내려온 템플릿이고, 서버
// 쌍둥이(src/server/agents/vars.ts)는 런북을 렌더하지 않으므로 이 변수를 모른다.
export function buildReportTable(agents) {
  if (agents.length === 0) return "none";
  const rows = agents.map((a) => `| \`${a.name}\` | ${a.description} |`).join("\n");
  return `| agent | does |\n| --- | --- |\n${rows}`;
}

// 에이전트 템플릿 frontmatter의 description 한 줄. 없으면 던진다 — 표에 빈 칸이 조용히 들어가는 것보다 init이
// 멈추는 편이 싸다(private 시험이 템플릿마다 있음을 먼저 잡는다). \r?\n: autocrlf 체크아웃은 CRLF다.
export function templateDescription(body, name) {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(body);
  const match = frontmatter && /^description:\s*(.+?)\s*$/m.exec(frontmatter[1]);
  if (!match) throw new Error(`${name}: no description in frontmatter`);
  return match[1];
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
