import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../../", import.meta.url));
const REPORT = /^docs\/test-reports\/(active|completed)\/([^/]+\.md)$/;
const KEYS = ["status", "stage", "result", "report-kind", "report-size", "test-levels", "test-tools", "created-at", "completed-at", "last-executed-at", "tested-revision", "owners", "related", "primary-area", "observed-environments", "test-summary", "follow-up"];
const ARRAYS = ["test-levels", "test-tools", "owners", "related", "observed-environments", "follow-up"];
const STAGES = ["planned", "running", "blocked", "awaiting-rerun"];
const RESULTS = ["pass", "fail", "blocked"];
const KINDS = ["audit", "acceptance", "regression", "smoke", "exploratory"];
const SIZES = ["compact", "standard"];
const LEVELS = ["static", "component", "integration", "contract", "end-to-end", "manual"];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function scalar(raw) {
  if (raw === "null") return null;
  if (raw.startsWith("'")) {
    if (!/^'(?:[^']|'')*'$/.test(raw)) throw new Error(`invalid single-quoted value ${raw}`);
    return raw.slice(1, -1).replace(/''/g, "'");
  }
  if (raw.startsWith('"')) return JSON.parse(raw);
  if (/^[[\]{}&*!|>%@`]/.test(raw)) throw new Error(`unsupported value ${raw}`);
  return raw;
}

function inlineList(inner) {
  const items = [];
  let rest = inner.trim();
  while (rest) {
    const match = /^('(?:[^']|'')*'|"(?:[^"\\]|\\.)*"|[^,]+)\s*(,|$)/.exec(rest);
    if (!match) throw new Error(`invalid list [${inner}]`);
    items.push(scalar(match[1].trim()));
    rest = rest.slice(match[0].length).trim();
    if (match[2] === "," && !rest) throw new Error(`invalid list [${inner}]`);
  }
  return items;
}

export function parseFrontMatter(text) {
  const match = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(text.replace(/\r\n/g, "\n"));
  if (!match) return null;
  const fields = {}, bare = new Set();
  let open = null;
  for (const line of match[1].split("\n")) {
    if (!line.trim()) continue;
    const item = /^\s+-\s+(.+)$/.exec(line);
    if (item) {
      if (!open) throw new Error("list item without a key");
      fields[open].push(scalar(item[1].trim()));
      continue;
    }
    const pair = /^([a-z][a-z0-9-]*):(?:\s+(.*))?$/.exec(line);
    if (!pair) throw new Error(`unsupported line "${line.trim()}"`);
    if (Object.hasOwn(fields, pair[1])) throw new Error(`duplicate key ${pair[1]}`);
    const raw = (pair[2] ?? "").trim();
    open = null;
    if (!raw) {
      fields[pair[1]] = [];
      bare.add(pair[1]);
      open = pair[1];
    } else if (raw.startsWith("[")) {
      if (!raw.endsWith("]")) throw new Error(`invalid list ${raw}`);
      fields[pair[1]] = inlineList(raw.slice(1, -1));
    } else fields[pair[1]] = scalar(raw);
  }
  for (const key of bare) if (!fields[key].length) fields[key] = null;
  return fields;
}

function inspectReport(file, folder, name, text, isTracked) {
  let fields;
  try {
    fields = parseFrontMatter(text);
  } catch (error) {
    return [`${file}: front matter: ${error.message}`];
  }
  if (!fields) return [`${file}: missing front matter`];
  const problems = [], add = message => problems.push(`${file}: ${message}`), has = key => Object.hasOwn(fields, key);
  const missing = KEYS.filter(key => !has(key));
  if (missing.length) add(`missing front matter keys: ${missing.join(", ")}`);
  for (const key of ARRAYS) if (has(key) && (!Array.isArray(fields[key]) || fields[key].some(value => typeof value !== "string"))) add(`${key} must be an array of strings`);
  if (fields.status !== folder) add(`status must be "${folder}" in ${folder}/`);
  if (folder === "active") {
    if (has("stage") && !STAGES.includes(fields.stage)) add(`stage must be one of ${STAGES.join(", ")} while active`);
    if (has("result") && fields.result !== null) add("result must be null while active");
    if (has("completed-at") && fields["completed-at"] !== null) add("completed-at must be null while active");
    if (has("report-kind") && fields["report-kind"] !== null && !KINDS.includes(fields["report-kind"])) add(`report-kind must be null or one of ${KINDS.join(", ")}`);
  } else {
    if (has("stage") && fields.stage !== null) add("stage must be null when completed");
    if (has("result") && !RESULTS.includes(fields.result)) add(`result must be one of ${RESULTS.join(", ")} when completed`);
    const date = fields["completed-at"];
    if (has("completed-at") && (typeof date !== "string" || !DATE.test(date) || !name.startsWith(`${date}-`))) add("completed-at must be the YYYY-MM-DD date that starts the file name");
    if (!/^\d{4}-\d{2}-\d{2}-/.test(name)) add("completed file name must start with YYYY-MM-DD-");
    if (has("report-kind") && !KINDS.includes(fields["report-kind"])) add(`report-kind must be one of ${KINDS.join(", ")} when completed`);
  }
  if (has("report-size") && !SIZES.includes(fields["report-size"])) add(`report-size must be one of ${SIZES.join(", ")}`);
  if (Array.isArray(fields["test-levels"])) for (const level of fields["test-levels"]) if (!LEVELS.includes(level)) add(`test-levels value "${level}" is not one of ${LEVELS.join(", ")}`);
  if (has("created-at") && (typeof fields["created-at"] !== "string" || !DATE.test(fields["created-at"]))) add("created-at must be YYYY-MM-DD");
  if (Array.isArray(fields.related)) {
    for (const reference of fields.related) {
      if (typeof reference !== "string" || reference.startsWith("https://")) continue;
      if (!/^docs\/.+\.md$/.test(reference)) add(`related "${reference}" must be a docs/...md path or an https:// URL`);
      else if (!isTracked(reference)) add(`related "${reference}" does not exist`);
    }
  }
  return problems;
}

export function relativeLinks(text) {
  const prose = text.replace(/\r\n/g, "\n").replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, "").replace(/`[^`\n]*`/g, "");
  const targets = [];
  for (const match of prose.matchAll(/\]\(\s*(?:<([^<>\n]+)>|((?:[^()\s<>]|\([^()\s]*\))+))(?:\s+"[^"]*")?\s*\)/g)) targets.push(match[1] ?? match[2]);
  for (const match of prose.matchAll(/^ {0,3}\[[^\]]+\]:\s*<?([^\s>]+)>?/gm)) targets.push(match[1]);
  return targets.filter(target => !/^[a-z][a-z0-9+.-]*:/i.test(target) && !target.startsWith("#") && !target.startsWith("//"));
}

export function inspectDocs(root = repository, files = trackedFiles(root)) {
  const tracked = new Set(files), directories = new Set();
  for (const file of files) for (let dir = posix.dirname(file); dir !== "."; dir = posix.dirname(dir)) directories.add(dir);
  const isTracked = path => tracked.has(path) || directories.has(path);
  const problems = [];
  let links = 0, reports = 0;
  for (const file of files.filter(name => name.endsWith(".md"))) {
    const text = readFileSync(join(root, file), "utf8");
    const report = REPORT.exec(file);
    if (report) {
      reports++;
      problems.push(...inspectReport(file, report[1], report[2], text, isTracked));
    }
    for (const target of relativeLinks(text)) {
      links++;
      let path;
      try {
        path = decodeURIComponent(target.split("#")[0].split("?")[0]);
      } catch {
        problems.push(`${file}: link "${target}" is not valid URL encoding`);
        continue;
      }
      if (!path) continue;
      const resolved = posix.normalize(path.startsWith("/") ? path.slice(1) : posix.join(posix.dirname(file), path)).replace(/\/$/, "");
      if (resolved === ".." || resolved.startsWith("../")) problems.push(`${file}: link "${target}" points outside the repository`);
      else if (resolved !== "." && !isTracked(resolved)) problems.push(`${file}: link "${target}" does not resolve to a tracked file`);
    }
  }
  return { problems, markdown: files.filter(name => name.endsWith(".md")).length, links, reports };
}

function trackedFiles(root) {
  return execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8", maxBuffer: 64 << 20 }).split("\0").filter(Boolean);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = inspectDocs();
    for (const problem of result.problems) console.error(problem);
    if (result.problems.length) process.exitCode = 1;
    else console.log(`Docs check passed: ${result.markdown} Markdown files, ${result.links} relative links, ${result.reports} test reports.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Docs check failed");
    process.exitCode = 1;
  }
}
