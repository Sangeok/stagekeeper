// 순수. import 없음. ApcH apps/admin/src/fsd/entities/pipeline/model/board.ts(de25a1c) 이식. Phase 2 임포트 전용.
const HEADING_RE = /^##\s+(.+)$/;
const ITEM_RE = /^- \[([ xX])\] ([A-Z]+-\d+): (.+)$/;
const FIELD_RE = /^\s+(agent|area|status|근거|결과|검증):\s*(.+)$/;

export function parseBoard(markdown) {
  const sections = [];
  let section = null;
  let item = null;
  for (const line of markdown.split(/\r?\n/)) {
    if (line.startsWith(">")) continue;
    const h = HEADING_RE.exec(line);
    if (h) { section = { heading: h[1].trim(), items: [] }; sections.push(section); item = null; continue; }
    const it = ITEM_RE.exec(line);
    if (it) {
      if (!section) continue;
      item = { checked: it[1].toLowerCase() === "x", id: it[2], title: it[3].trim(),
               agent: null, area: null, status: null, reason: null, result: null, validation: null };
      section.items.push(item);
      continue;
    }
    const f = FIELD_RE.exec(line);
    if (f && item) {
      const value = f[2].trim();
      switch (f[1]) {
        case "agent": item.agent = value; break;
        case "area": item.area = value; break;
        case "status": item.status = value; break;
        case "근거": item.reason = value; break;
        case "결과": item.result = item.result === null ? value : item.result + " " + value; break;
        case "검증": item.validation = value; break;
      }
    }
  }
  return sections.filter((s) => s.items.length > 0);
}

export function latestItemById(sections, id) {
  for (const s of sections) for (const it of s.items) if (it.id === id) return it;
  return null;
}
