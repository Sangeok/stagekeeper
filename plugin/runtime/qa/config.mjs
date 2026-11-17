import { qaHttpUrl, qaText } from "../../lib/qa/validation.mjs";

export const QA_BROWSER_TOOLS = ["browser_navigate", "browser_snapshot", "browser_click", "browser_type", "browser_fill_form", "browser_press_key", "browser_select_option", "browser_wait_for", "browser_take_screenshot", "browser_console_messages", "browser_network_requests"];

export function parseQaConfig(value, release = null) {
  if (value === undefined) return null;
  if (!value || value.environment !== "test") throw new Error("qa.environment: explicit test environment required");
  const baseUrl = qaHttpUrl(value.baseUrl, "qa.baseUrl"), mcpUrl = qaHttpUrl(value.mcpUrl, "qa.mcpUrl");
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(mcpUrl).hostname)) throw new Error("qa.mcpUrl: local isolated Playwright MCP endpoint required");
  if (release && new URL(baseUrl).origin === new URL(release.baseUrl).origin) throw new Error("qa.baseUrl: release origin cannot be used for QA");
  const scenariosPath = qaText(value.scenariosPath, "qa.scenariosPath", 300);
  if (scenariosPath.includes("\\") || scenariosPath.split("/").some(part => !part || part === "." || part === "..") || /^[a-z]+:|^\//i.test(scenariosPath)) throw new Error("qa.scenariosPath: repository-relative path required");
  let artifactsDir;
  if (value.artifactsDir !== undefined) {
    artifactsDir = qaText(value.artifactsDir, "qa.artifactsDir", 500).replaceAll("\\", "/");
    if (!/^(?:[A-Za-z]:\/|\/)/.test(artifactsDir) || artifactsDir.includes("\0") || artifactsDir.split("/").includes("..")) throw new Error("qa.artifactsDir: absolute dedicated MCP output directory required");
  }
  return { environment: "test", baseUrl, mcpUrl, scenariosPath, ...(artifactsDir ? { artifactsDir } : {}) };
}
