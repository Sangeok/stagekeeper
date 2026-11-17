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
