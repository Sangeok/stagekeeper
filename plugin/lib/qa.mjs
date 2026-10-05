// Browser QA is an opt-in test environment, never inferred from release settings.
export const QA_BROWSER_TOOLS = ["browser_navigate", "browser_snapshot", "browser_click", "browser_type", "browser_fill_form", "browser_press_key", "browser_select_option", "browser_wait_for", "browser_take_screenshot", "browser_console_messages", "browser_network_requests"];

function text(value, name, limit = 2000) {
  if (typeof value !== "string" || !value.trim() || value.length > limit) throw new Error(`${name}: nonempty string required (max ${limit})`);
  return value.trim();
}
function httpUrl(value, name) {
  const url = new URL(text(value, name));
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error(`${name}: plain HTTP(S) URL required`);
  return url.href.replace(/\/$/, "");
}
export function parseQaConfig(value, release = null) {
  if (value === undefined) return null;
  if (!value || value.environment !== "test") throw new Error("qa.environment: explicit test environment required");
  const baseUrl = httpUrl(value.baseUrl, "qa.baseUrl"), mcpUrl = httpUrl(value.mcpUrl, "qa.mcpUrl");
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(mcpUrl).hostname)) throw new Error("qa.mcpUrl: local isolated Playwright MCP endpoint required");
  if (release && new URL(baseUrl).origin === new URL(release.baseUrl).origin) throw new Error("qa.baseUrl: release origin cannot be used for QA");
  const scenariosPath = text(value.scenariosPath, "qa.scenariosPath", 300);
  if (scenariosPath.includes("\\") || scenariosPath.split("/").some(part => !part || part === "." || part === "..") || /^[a-z]+:|^\//i.test(scenariosPath)) throw new Error("qa.scenariosPath: repository-relative path required");
  let artifactsDir;
  if (value.artifactsDir !== undefined) {
    artifactsDir = text(value.artifactsDir, "qa.artifactsDir", 500).replaceAll("\\", "/");
    if (!/^(?:[A-Za-z]:\/|\/)/.test(artifactsDir) || artifactsDir.includes("\0") || artifactsDir.split("/").includes("..")) throw new Error("qa.artifactsDir: absolute dedicated MCP output directory required");
  }
  return { environment: "test", baseUrl, mcpUrl, scenariosPath, ...(artifactsDir ? { artifactsDir } : {}) };
}
export function parseQaReport(value) {
  if (!value || !["pass", "fail", "blocked"].includes(value.verdict)) throw new Error("qa.verdict: pass | fail | blocked required");
  const targetCommit = text(value.targetCommit, "qa.targetCommit", 40);
  if (!/^[0-9a-f]{7,40}$/.test(targetCommit)) throw new Error("qa.targetCommit: actual implementation commit required");
  const baseUrl = value.verdict === "blocked" && value.baseUrl === null ? null : httpUrl(value.baseUrl, "qa.baseUrl");
  if (!Array.isArray(value.scenarios) || !value.scenarios.length || value.scenarios.length > 50) throw new Error("qa.scenarios: 1..50 results required");
  const scenarios = value.scenarios.map(result => {
    if (!result || !["pass", "fail", "blocked"].includes(result.status)) throw new Error("qa scenario status required");
    if (!Array.isArray(result.evidence) || !result.evidence.length || result.evidence.length > 10) throw new Error("qa scenario evidence required");
    return { id: text(result.id, "qa scenario id", 100), status: result.status, expected: text(result.expected, "qa expected"), actual: text(result.actual, "qa actual"), evidence: result.evidence.map(item => text(item, "qa evidence")) };
  });
  if (new Set(scenarios.map(result => result.id)).size !== scenarios.length) throw new Error("qa scenario ids must be unique");
  if (value.verdict === "pass" && scenarios.some(result => result.status !== "pass")) throw new Error("qa pass requires every required scenario to pass");
  if (value.verdict === "fail" && !scenarios.some(result => result.status === "fail")) throw new Error("qa fail requires a failed scenario");
  if (value.verdict === "blocked" && !scenarios.some(result => result.status === "blocked")) throw new Error("qa blocked requires an explicit blocker");
  const result = { verdict: value.verdict, targetCommit, baseUrl, scenarios };
  if (JSON.stringify(result).length > 64000) throw new Error("qa report too large");
  return result;
}
