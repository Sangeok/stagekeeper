import { spawn } from "node:child_process";
import { appendFileSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const options = Object.fromEntries(process.argv.slice(2).map(argument => argument.replace(/^--/, "").split("=")));
const file = options.file;
const rounds = Number(options.rounds ?? 5);
const parallel = Number(options.parallel ?? 4);
const label = options.label ?? file;
const EVIDENCE_LINES = 300;

const unescapeTap = name => name.replace(/\\#/g, "#").replace(/\\\\/g, "\\");

function readEvidence(directory) {
  const items = [];
  try {
    for (const name of readdirSync(directory)) {
      try { items.push(JSON.parse(readFileSync(path.join(directory, name), "utf8"))); }
      catch (error) { items.push({ name: `unreadable ${name}`, unreadable: String(error) }); }
    }
  } catch {}
  return items;
}

function runOnce(copy) {
  return new Promise(resolve => {
    const started = Date.now();
    const evidenceDirectory = mkdtempSync(path.join(tmpdir(), `stress-evidence-${copy}-`));
    const env = { ...process.env, STAGEKEEPER_TEST_EVIDENCE_DIR: evidenceDirectory };
    const child = spawn(process.execPath, ["--test", "--test-reporter=tap", file], { stdio: ["ignore", "pipe", "pipe"], env });
    let output = "";
    child.stdout.on("data", chunk => { output += chunk; });
    child.stderr.on("data", chunk => { output += chunk; });
    const timer = setTimeout(() => child.kill(), 15 * 60 * 1000);
    child.on("close", code => {
      clearTimeout(timer);
      const failed = [...output.matchAll(/^\s*not ok \d+ - (.+)$/gm)].map(match => match[1].trim());
      const details = [...output.matchAll(/^\s*(?:error|code|expected|actual): .+$/gm)].map(match => match[0].trim()).slice(0, 12);
      const blocks = [...output.matchAll(/^not ok \d+ - .+\n(?:[ ]{2,}.*\n)*/gm)].map(match => match[0].split("\n").slice(0, 70).join("\n"));
      const evidence = readEvidence(evidenceDirectory);
      try { rmSync(evidenceDirectory, { recursive: true, force: true }); } catch {}
      const failedNames = new Set(failed.map(unescapeTap));
      resolve({ copy, code, seconds: Math.round((Date.now() - started) / 1000), failed, details, blocks,
        evidence: evidence.filter(item => failedNames.has(item.name)), kills: evidence.flatMap(item => (item.kills ?? []).map(kill => ({ ...kill, copy }))),
        missingEvidence: [...failedNames].filter(name => !evidence.some(item => item.name === name)) });
    });
  });
}

const json = value => { try { return JSON.stringify(value); } catch { return String(value); } };
const clip = (text, width = 600) => (text.length > width ? text.slice(0, width) + ` …(+${text.length - width})` : text);
const at = iso => (iso ? iso.slice(11, 23) : "?");
const flat = text => String(text).replace(/\s+/g, " ");

function formatEvidence(item, roundKills) {
  const out = [];
  const push = (line = "") => out.push(clip(line));
  if (item.unreadable) { push(`unreadable evidence: ${item.unreadable}`); return out; }
  const capture = item.capture ?? {};
  push(`test: pid=${item.testPid} started=${item.started} ended=${item.ended} captureAt=+${capture.msSinceStart}ms passedAtCapture=${capture.passedAtCapture} root=${item.root}`);
  if (capture.error) push(`error: ${flat(capture.error)}`);
  if (capture.captureError) push(`captureError: ${flat(capture.captureError)}`);
  push(`commands (${item.commands.length}):`);
  for (const command of item.commands) {
    push(`  #${command.index} [${command.phase}] +${command.startedMs}ms took=${command.took}ms exit=${json(command.exited)} code=${command.code} signal=${command.signal} pid=${command.pid} args=${json(command.args)}${command.extraEnv.length ? ` env+=${command.extraEnv.join(",")}` : ""}`);
    if (command.spawnError) push(`     spawnError: ${command.spawnError}`);
    if (command.took === null) push("     (not closed at capture)");
    else if (command.parseError) push(`     parseError: ${command.parseError} stdout=${json(command.stdout)}`);
    else push(`     event: ${json(command.event)}`);
    if (command.stderr) for (const line of command.stderr.split(/\r?\n/).filter(Boolean).slice(-15)) push(`     stderr| ${line}`);
  }
  if (item.git?.length) push(`git: ${item.git.map(entry => `+${entry.ms}ms ${entry.args.join(" ")} (${entry.took}ms${entry.error ? " ERROR " + flat(entry.error) : ""})`).join("; ")}`);
  push(`waits (${item.waits?.length ?? 0}, newest last):`);
  for (const wait of item.waits ?? []) push(`  ${at(wait.startedAt)} "${wait.what}" limit=${wait.limit} ${wait.outcome} after ${wait.ms}ms polls=${wait.polls}${wait.error ? " error=" + flat(wait.error) : ""}`);
  push("state at capture:");
  for (const [name, value] of Object.entries(capture.state ?? {})) {
    if (value === null || value === false || value?.exists === false) { push(`  ${name}: absent`); continue; }
    if (value === true) { push(`  ${name}: present`); continue; }
    push(`  ${name}: ${value.json !== undefined ? json(value.json) : value.raw !== undefined ? "RAW " + json(value.raw) : json(value)}`);
  }
  push(`processes (test pid ${capture.testPid}):`);
  for (const entry of capture.processes ?? []) push(`  ${entry.source} pid=${entry.pid} kill0=${entry.liveness}`);
  if (capture.processTable === undefined) push("  process table: skipped (test had passed at capture)");
  else if (!capture.processTable) push("  process table: no pids");
  else {
    const table = capture.processTable;
    push(`  process table: code=${table.code} signal=${table.signal}${table.error ? " error=" + table.error : ""}`);
    for (const line of table.output ?? []) push(`    ${line}`);
  }
  const pids = new Set([...(capture.processes ?? []).map(entry => entry.pid), ...item.commands.map(command => command.pid)].filter(Boolean));
  const ownKills = item.kills ?? [];
  push(`kills by this test (${ownKills.length}): ${ownKills.map(kill => `${at(kill.at)} ${kill.pid} ${kill.signal} [${kill.phase}] ${kill.result}`).join("; ")}`);
  const foreign = roundKills.filter(kill => pids.has(kill.pid) && kill.test !== item.name && kill.at >= item.started && kill.at <= (item.ended ?? "9"));
  push(`kills of this test's pids by other tests in the round (${foreign.length}):`);
  for (const kill of foreign) push(`  ${kill.at} pid=${kill.pid} ${kill.signal} by copy ${kill.copy} "${kill.test}" [${kill.phase}] ${kill.result}`);
  push(`server requests (${item.requests.length}, last 30): ${item.requests.slice(-30).map(request => `+${request.ms} ${request.op ?? request.url}=${request.status}`).join(" ")}`);
  push(`runnerCalls (${capture.runnerCalls?.length ?? 0}, last 25):`);
  for (const call of (capture.runnerCalls ?? []).slice(-25)) push(`  ${json(Object.fromEntries(Object.entries(call).filter(([, value]) => value !== undefined && value !== null)))}`);
  push(`notices: ${json(capture.notices ?? [])}`);
  const log = capture.log;
  push(log ? `background.log (${log.lines} lines${log.tail.length < log.lines ? `, last ${log.tail.length}` : ""}):` : "background.log: absent");
  for (const line of log?.tail ?? []) push(`  ${line}`);
  if (item.afterCleanup) {
    push(`after cleanup: +${item.afterCleanup.msSinceStart}ms lockExists=${item.afterCleanup.lockExists}`);
    for (const line of item.afterCleanup.newLogLines ?? []) push(`  log+ ${line}`);
  } else push("after cleanup: not reached (cleanup hung or threw before the second write)");
  if (out.length > EVIDENCE_LINES) return [...out.slice(0, EVIDENCE_LINES - 1), `…(${out.length - EVIDENCE_LINES + 1} more lines cut)`];
  return out;
}

const results = [];
const evidenceShown = {};
for (let round = 0; round < rounds; round++) {
  const batch = await Promise.all(Array.from({ length: parallel }, (_, index) => runOnce(`${round + 1}.${index + 1}`)));
  const roundKills = batch.flatMap(result => result.kills);
  for (const { evidence, kills, missingEvidence, ...result } of batch) {
    results.push(result);
    for (const item of evidence) {
      evidenceShown[item.name] = (evidenceShown[item.name] ?? 0) + 1;
      if (evidenceShown[item.name] > 2) continue;
      console.log(`STRESS_EVIDENCE_BEGIN ${item.name}\ncopy: ${result.copy} (round ${round + 1}, ${parallel} in parallel)`);
      for (const line of formatEvidence(item, roundKills)) console.log(line);
      console.log("STRESS_EVIDENCE_END");
    }
    for (const name of missingEvidence) console.log(`STRESS_EVIDENCE_MISSING ${name} (copy ${result.copy})`);
  }
}

const failures = results.filter(result => result.code !== 0);
const names = {};
for (const failure of failures) for (const name of failure.failed) names[name] = (names[name] ?? 0) + 1;
const seconds = results.map(result => result.seconds).sort((a, b) => a - b);
const summary = { label, runs: results.length, failedRuns: failures.length, medianSeconds: seconds[Math.floor(seconds.length / 2)], maxSeconds: seconds.at(-1), failedTests: names, sample: failures[0]?.details ?? [] };
const shown = {};
for (const failure of failures) for (const block of failure.blocks) {
  const name = block.split("\n")[0];
  shown[name] = (shown[name] ?? 0) + 1;
  if (shown[name] <= 2) console.log(`STRESS_FAILURE_BEGIN\n${block}\nSTRESS_FAILURE_END`);
}
console.log(`STRESS_RESULT ${JSON.stringify(summary)}`);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n\`\`\`json\n${JSON.stringify(summary, null, 2)}\n\`\`\`\n`);
