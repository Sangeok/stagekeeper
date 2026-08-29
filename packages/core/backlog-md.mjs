// 순수. ApcH TASK_BACKLOG.md 형식: "- [ ] **ID**: 제목" + "  - area: …" + "  - source: …". 임포트 전용.
const ITEM_RE = /^- \[[ xX]\] \*\*([A-Z]+-\d+)\*\*: (.+)$/;
const FIELD_RE = /^\s+- (area|source): (.+)$/;

export function parseBacklog(markdown) {
  const items = [];
  let cur = null;
  for (const line of markdown.split(/\r?\n/)) {
    const m = ITEM_RE.exec(line);
    if (m) { cur = { key: m[1], title: m[2].trim(), area: "", source: "" }; items.push(cur); continue; }
    const f = FIELD_RE.exec(line);
    if (f && cur) { cur[f[1]] = f[2].trim(); continue; }
    if (!/^\s/.test(line)) cur = null; // 들여쓰기 없는 다른 줄이 오면 항목 종료
  }
  return items;
}
