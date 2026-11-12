import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../../", import.meta.url));
const SUPPORTED = ["Windows", "macOS"];
const SYSTEMS = ["Windows", "macOS", "Linux"];
const CLASSES = ["공통", "OS별", "단일 OS"];
const HEADERS = ["검사", "분류", ...SYSTEMS, "미충족", "이유 또는 확인 문자열"];
const START = "<!-- ci-coverage:start -->";
const END = "<!-- ci-coverage:end -->";
const RUNNERS = [["windows-", "Windows"], ["macos-", "macOS"], ["ubuntu-", "Linux"]];
const JOB_REFERENCE = /^[a-z0-9-]+\/[a-z0-9-]+$/;
const RECORD_ACTION = "./.github/actions/gate-record";

function systemOf(runner, where) {
  const match = RUNNERS.find(([prefix]) => runner.startsWith(prefix));
  if (!match) throw new Error(`${where}: runner "${runner}" is not a Windows, macOS or Ubuntu runner`);
  return match[1];
}

function listValues(raw) {
  const value = raw.trim();
  return value.startsWith("[") && value.endsWith("]") ? value.slice(1, -1).split(",").map(item => item.trim()).filter(Boolean) : [value];
}

export function readWorkflow(name, text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const start = lines.indexOf("jobs:");
  if (start < 0) throw new Error(`${name}: no jobs section`);
  const jobs = [];
  let current = null;
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) throw new Error(`${name}: unexpected top-level line after jobs`);
    const header = /^ {2}([a-z][a-z0-9-]*):\s*$/.exec(line);
    if (header) {
      current = { id: header[1], lines: [] };
      jobs.push(current);
    } else if (/^ {2}\S/.test(line)) throw new Error(`${name}: unsupported job line "${line.trim()}"`);
    else if (current) current.lines.push(line);
  }
  if (jobs.length === 0) throw new Error(`${name}: no jobs`);
  return jobs.map(job => {
    const where = `${name}/${job.id}`;
    const body = job.lines.join("\n");
    const runsOn = /^ {4}runs-on: (.+)$/m.exec(body)?.[1].trim();
    if (!runsOn) throw new Error(`${where}: no runs-on`);
    const matrixKey = /^\$\{\{ matrix\.([a-z]+) \}\}$/.exec(runsOn)?.[1];
    const runners = matrixKey ? [...body.matchAll(new RegExp(`^\\s+(?:- )?${matrixKey}: (.+)$`, "gm"))].flatMap(match => listValues(match[1])) : listValues(runsOn);
    if (runners.length === 0) throw new Error(`${where}: no runners for matrix.${matrixKey}`);
    const needs = /^ {4}needs: \[(.+)\]$/m.exec(body)?.[1].split(",").map(item => item.trim()) ?? [];
    return {
      key: where,
      text: body,
      systems: [...new Set(runners.map(runner => systemOf(runner, where)))],
      matrixLegs: [...body.matchAll(/^\s+leg: ([a-z0-9_]+)\s*$/gm)].map(match => match[1]),
      summaryLegs: [...body.matchAll(/^ {6}summary_([a-z0-9_]+):/gm)].map(match => match[1]),
      needs: needs.map(id => `${name}/${id}`),
      recordLegs: body.includes(RECORD_ACTION) ? listValues(`[${/^ {10}legs: (.+)$/m.exec(body)?.[1] ?? ""}]`) : null,
    };
  });
}

function codeSpans(cell) {
  return [...cell.matchAll(/`([^`]+)`/g)].map(match => match[1]);
}

export function readCoverageTable(markdown) {
  const text = markdown.replace(/\r\n/g, "\n");
  const start = text.indexOf(START), end = text.indexOf(END);
  if (start < 0 || end < start) throw new Error("the CI coverage table markers are missing");
  const rows = text.slice(start + START.length, end).split("\n").filter(line => line.trim().startsWith("|")).map(line => line.trim().slice(1, -1).split("|").map(cell => cell.trim()));
  if (rows.length < 3 || rows[0].join("|") !== HEADERS.join("|")) throw new Error(`the CI coverage table must have the columns ${HEADERS.join(", ")}`);
  return rows.slice(2).map(cells => {
    if (cells.length !== HEADERS.length) throw new Error(`the CI coverage row "${cells[0]}" must have ${HEADERS.length} cells`);
    const [name, category, windows, macos, linux, unmet, note] = cells;
    return {
      name,
      category,
      jobs: { Windows: codeSpans(windows), macOS: codeSpans(macos), Linux: codeSpans(linux) },
      unmet: unmet ? unmet.split(",").map(item => item.trim()).filter(Boolean) : [],
      note,
      strings: codeSpans(note),
    };
  });
}

function testTargets(packageJson) {
  return [...String(packageJson?.scripts?.test ?? "").matchAll(/\\?"([^"\\]+)\\?"/g)].map(match => match[1]);
}

export function inspectCoverage({ workflows, table, packageJson }) {
  const problems = [];
  const jobs = new Map(workflows.flat().map(job => [job.key, job]));
  const classified = new Set();
  const targets = testTargets(packageJson);
  const has = (job, value) => (value === "npm test" ? job.text.includes("npm test") || (targets.length > 0 && targets.every(target => job.text.includes(target))) : job.text.includes(value));

  for (const row of table) {
    const label = `row "${row.name}"`;
    if (!CLASSES.includes(row.category)) problems.push(`${label}: the class must be one of ${CLASSES.join(", ")}`);
    for (const system of SYSTEMS) {
      for (const reference of row.jobs[system]) {
        if (!JOB_REFERENCE.test(reference)) problems.push(`${label}: "${reference}" in the ${system} cell is not a workflow/job reference`);
        else if (!jobs.has(reference)) problems.push(`${label}: job ${reference} does not exist`);
        else if (!jobs.get(reference).systems.includes(system)) problems.push(`${label}: job ${reference} does not run on ${system}`);
        else classified.add(reference);
      }
    }
    for (const system of row.unmet) if (!SUPPORTED.includes(system)) problems.push(`${label}: "${system}" in the unmet cell is not a supported system`);
    const listed = system => row.jobs[system].filter(reference => jobs.get(reference)?.systems.includes(system));
    if (row.category === "OS별") {
      for (const system of SUPPORTED) {
        const covering = listed(system);
        const covered = covering.length > 0 && covering.every(reference => row.strings.every(value => has(jobs.get(reference), value)));
        if (!covered && !row.unmet.includes(system)) problems.push(`${label}: a per-OS check needs a ${system} job that runs ${row.strings.join(", ") || "it"}, or ${system} in the unmet cell`);
        if (covered && row.unmet.includes(system)) problems.push(`${label}: ${system} is listed as unmet but ${covering.join(", ")} covers it`);
      }
    } else {
      if (row.unmet.length > 0) problems.push(`${label}: only a per-OS check can have unmet systems`);
      const used = SYSTEMS.filter(system => listed(system).length > 0);
      if (used.length === 0) problems.push(`${label}: no job is listed`);
      if (row.category === "단일 OS" && used.length !== 1) problems.push(`${label}: a single-OS check lists jobs on exactly one system`);
      if ((row.category === "단일 OS" || !used.includes("Linux")) && !row.note) problems.push(`${label}: a check that runs on one system needs a reason`);
    }
  }

  for (const job of jobs.values()) {
    if (!classified.has(job.key)) problems.push(`job ${job.key} is not in the CI coverage table`);
    if (job.recordLegs === null) continue;
    const gates = job.needs.map(key => jobs.get(key)).filter(Boolean);
    if (gates.length !== 1) {
      problems.push(`job ${job.key}: a record job needs exactly one gate job`);
      continue;
    }
    const declared = [...gates[0].summaryLegs].sort();
    if (declared.join(",") !== [...job.recordLegs].sort().join(",")) problems.push(`job ${job.key}: legs [${job.recordLegs.join(", ")}] differ from the summary outputs [${gates[0].summaryLegs.join(", ")}] of ${gates[0].key}`);
    for (const leg of gates[0].matrixLegs) if (!declared.includes(leg)) problems.push(`job ${gates[0].key}: matrix leg ${leg} has no summary_${leg} output`);
  }
  return problems;
}

export function inspectRepository(root = repository) {
  const directory = join(root, ".github", "workflows");
  const workflows = readdirSync(directory).filter(name => name.endsWith(".yml")).sort().map(name => readWorkflow(name.replace(/\.yml$/, ""), readFileSync(join(directory, name), "utf8")));
  const table = readCoverageTable(readFileSync(join(root, "docs", "architecture", "verification.md"), "utf8"));
  const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  return { problems: inspectCoverage({ workflows, table, packageJson }), jobs: workflows.flat().length, rows: table.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = inspectRepository();
    for (const problem of result.problems) console.error(problem);
    if (result.problems.length) process.exitCode = 1;
    else console.log(`CI coverage check passed: ${result.jobs} jobs, ${result.rows} rows.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "CI coverage check failed");
    process.exitCode = 1;
  }
}
