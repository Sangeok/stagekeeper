export const SCRATCH_TOOLS = { "plan-verifier": ["Write"] };

export function renderClaudeRole(body, logicalRole) {
  const scratch = SCRATCH_TOOLS[logicalRole] ?? [];
  return body.replace(/^tools:[ \t]*([^\r\n]*)/m, (line, list) => {
    const tools = list.split(",").map(tool => tool.trim()).filter(Boolean);
    const missing = scratch.filter(tool => !tools.includes(tool));
    if (missing.length === 0) return line;
    const at = tools.indexOf("Read") + 1;
    return `tools: ${[...tools.slice(0, at), ...missing, ...tools.slice(at)].join(", ")}`;
  });
}
