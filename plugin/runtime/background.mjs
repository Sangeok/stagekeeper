// 창 없는 상주 실행기(Phase B)의 한 사이클과 그 판단. 프로세스·git·서버·알림은 deps로 받아 시험이 가짜로 바꾼다.
// 설계: docs/proposals/active/runner-status-and-background-runner.md B-1~B-4, 결정 B1~B7.
import { hasWork, workSignature } from "../lib/watch.mjs";

export const INTERVAL_MS = 60_000;
export const RUN_LIMIT_MS = 2 * 60 * 60_000;
export const FAILURE_LIMIT = 3;
export const REQUEST_FAILURE_LIMIT = 5;
export const RUN_LOG_KEEP = 50;
const FILES_SHOWN = 3;
const RESULT_MAX = 150;

// 알림 문구. 모두 2026-10-21 사용자 확정(product-copy §15).
export const NOTICES = Object.freeze({
  waitDirty: { title: "Runner waiting on {branch}", body: "Uncommitted changes: {files}. Commit or stash them, and it continues." },
  waitInterrupted: { title: "Runner waiting on {branch}", body: "The last run stopped partway and left changes in {files}. Check them, then commit or stash them, and it continues." },
  waitBranch: { title: "Runner waiting on {branch}", body: "This checkout is on {current}. Switch back to {branch}, and it continues." },
  branchEnded: { title: "Runner ended a run", body: "The checkout switched to {current} during a run, so the runner ended that run. Switch back to {branch}, and it continues." },
  pausedFinished: { title: "Runner paused", body: "The run in progress finished. You can edit {branch} now. Nothing new starts until you choose Resume." },
  stuck: { title: "Runner stopped", body: "The same steps came back three times without progress. Check its run log with /harness:background status, then start it again." },
  error: { title: "Runner stopped", body: "It hit an error. Check its run log with /harness:background status, then start it again." },
  plan: { title: "Runner stopped", body: "The background runner needs Pro." },
  replaced: { title: "Runner stopped", body: "Another runner took over this project. This one stops." },
  missing: { title: "Runner stopped", body: "The server stopped taking runner signals, so the runner stopped. Start it again when the server is back." },
  startRefused: { title: "Runner did not start", body: "{reason}" },
});

export function fillNotice(kind, values = {}) {
  const fill = text => text.replace(/\{(\w+)\}/g, (match, key) => (Object.hasOwn(values, key) ? String(values[key]) : match));
  return { kind, title: fill(NOTICES[kind].title), body: fill(NOTICES[kind].body) };
}

// `git status --porcelain -z`의 경로. 이름 바꾸기·복사는 원래 경로 필드를 하나 더 갖는다.
export function porcelainPaths(output) {
  const fields = output.split("\0");
  const paths = [];
  for (let i = 0; i < fields.length; i++) {
    const entry = fields[i];
    if (entry.length < 4) continue;
    paths.push(entry.slice(3));
    if (/[RC]/.test(entry.slice(0, 2))) i++;
  }
  return paths;
}

export function fileList(paths) {
  const shown = paths.slice(0, FILES_SHOWN).join(", ");
  return paths.length > FILES_SHOWN ? `${shown} and ${paths.length - FILES_SHOWN} more` : shown;
}

// Windows 명령줄 한 인자(CommandLineToArgvW 규칙). job 런처가 ProcessStartInfo.Arguments로 그대로 넘긴다.
export function quoteWindowsArgument(value) {
  if (value !== "" && !/[\s"]/.test(value)) return value;
  let out = "\"", slashes = 0;
  for (const ch of value) {
    if (ch === "\\") { slashes++; continue; }
    if (ch === "\"") { out += "\\".repeat(slashes * 2 + 1) + "\""; slashes = 0; continue; }
    out += "\\".repeat(slashes) + ch;
    slashes = 0;
  }
  return out + "\\".repeat(slashes * 2) + "\"";
}

// 자식 `claude -p`의 git이 push하지 못하게 한다(결정 B1). 빈 pushInsteadOf는 모든 push URL을 없는 전송으로 바꾼다.
// 이미 GIT_CONFIG_COUNT가 있으면 그 뒤 번호로 덧붙인다. 사용자 git 설정 파일은 바꾸지 않는다.
export function pushBlockedEnv(env) {
  const out = { ...env };
  const current = Number(env.GIT_CONFIG_COUNT);
  const index = Number.isInteger(current) && current >= 0 && String(current) === String(env.GIT_CONFIG_COUNT ?? "").trim() ? current : 0;
  out.GIT_CONFIG_COUNT = String(index + 1);
  out[`GIT_CONFIG_KEY_${index}`] = "url.stagekeeper-push-blocked://.pushInsteadOf";
  out[`GIT_CONFIG_VALUE_${index}`] = "";
  return out;
}

export function runArguments({ session, permission, settings }) {
  return ["-p", `/harness:watch --once --session ${session}`,
    "--permission-mode", permission === "auto" ? "auto" : "acceptEdits",
    "--settings", settings,
    "--disallowedTools", "Bash(git push:*)", "PowerShell(git push*)",
    "--output-format", "stream-json", "--verbose"];
}

// `background-settings.json`. 목록 밖은 auto 분류기(auto) 또는 거절(acceptEdits)이 판정한다.
export function backgroundSettings(config) {
  const commands = ["git status", "git diff", "git log", "git show", "git add", "git commit", "git rev-parse"];
  const allow = ["mcp__harness"];
  for (const command of commands) allow.push(`Bash(${command})`, `Bash(${command} *)`, `PowerShell(${command})`, `PowerShell(${command} *)`);
  for (const workspace of config.workspaces ?? []) for (const command of workspace.verify ?? []) allow.push(`Bash(${command})`, `PowerShell(${command})`);
  allow.push("PowerShell(powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File *harness.ps1* *)",
    "Bash(powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File *harness.ps1* *)");
  return { permissions: { allow: [...new Set(allow)], deny: ["Bash(git push:*)", "PowerShell(git push*)"] } };
}

// stream-json 줄에서 init과 result만 읽는다. 모델이 쓴 문장은 싣지 않는다.
export function readStreamLine(line, run) {
  let message;
  try { message = JSON.parse(line); } catch { return; }
  if (message?.type === "system" && message.subtype === "init" && typeof message.permissionMode === "string") run.permissionMode = message.permissionMode;
  if (message?.type === "result") run.result = {
    subtype: typeof message.subtype === "string" ? message.subtype : null,
    isError: message.is_error === true,
    turns: Number.isInteger(message.num_turns) ? message.num_turns : null,
    terminal: typeof message.terminal_reason === "string" ? message.terminal_reason : null,
    denials: Array.isArray(message.permission_denials) ? message.permission_denials.length : 0,
  };
}

// 실행 결과의 종류와 서버에 올릴 한 줄. 고정 어휘만 쓴다.
export function classifyRun(end) {
  if (end.endedFor === "branch") return { outcome: "branch", line: "ended: the branch changed" };
  if (end.endedFor === "timeout") return { outcome: "timeout", line: "ended: time limit" };
  if (end.endedFor === "stop") return { outcome: "error", line: "ended: runner stopping" };
  const result = end.result;
  if (result && !result.isError && result.subtype === "success") {
    return { outcome: "success", line: `done: ${result.turns ?? "?"} turns, ${result.denials} denied`.slice(0, RESULT_MAX) };
  }
  if (result) return { outcome: "error", line: `error: ${result.subtype ?? "unknown"}${result.terminal ? ` (${result.terminal})` : ""}`.slice(0, RESULT_MAX) };
  return { outcome: "error", line: end.exitCode === 0 ? "error: no result" : `error: exit ${end.exitCode}` };
}

/**
 * 상주 실행기의 루프. 끝날 때 멈춘 이유를 돌려준다:
 * owner(로컬 stop) · stuck · error · plan · replaced · missing(서버가 경로를 잃음).
 *
 * deps:
 * - lifecycle(): "active" | "stopping" | "gone" — 로컬 잠금. gone은 이 세션의 잠금이 아니다.
 * - beat(payload): runner 응답({kind,…}, runner-client.mjs)
 * - overview(): actionableWork 결과. 실패하면 throw
 * - tree(): { branch: string | null, current: string, dirty: string[] }
 * - startRun(): { done: Promise<{exitCode, result, permissionMode, endedFor, log}>, end(reason) }
 * - notify(notice) · save(status) · sleep(ms, signal?) · now() · log(line)
 */
export async function runResident(context, deps) {
  const { branch, interval = INTERVAL_MS, runLimit = RUN_LIMIT_MS } = context;
  const status = { state: "idle", waitReason: null, waitFiles: [], interrupted: null, lastResult: null, lastLog: null, failures: 0 };
  let wait = null;
  let failures = 0, transient = 0, requestFailures = 0;
  // 연속 실패의 종류. 모두 진전 없음일 때만 stuck이고, 오류·시간 초과가 하나라도 있으면 error다 — 배너의 이유 문장이 사실과 맞게.
  let failureKinds = [];
  const save = () => deps.save({ ...status, failures });

  // 서버 응답을 루프의 갈래로. paused는 그대로, 멈춤은 이유로.
  const verdict = result => {
    if (result.kind === "ok") return { paused: result.paused, stop: result.stop === "plan" ? "plan" : null };
    if (result.kind === "replaced") return { paused: false, stop: "replaced" };
    if (result.kind === "missing") return { paused: false, stop: "missing" };
    if (result.kind === "plan") return { paused: false, stop: "plan" };
    if (result.kind === "transient") return { paused: false, stop: null, transient: true };
    return { paused: false, stop: "error" };
  };
  const waitNotice = (reason, tree) => {
    if (reason === "branch") return fillNotice("waitBranch", { branch, current: tree.current });
    return fillNotice(status.interrupted ? "waitInterrupted" : "waitDirty", { branch, files: fileList(tree.dirty) });
  };
  const sleepActive = async ms => {
    // 멈춤 요청을 1초 안에 본다.
    for (let left = ms; left > 0; left -= 1000) {
      if (deps.lifecycle() !== "active") return;
      await deps.sleep(Math.min(1000, left));
    }
  };

  for (;;) {
    const life = deps.lifecycle();
    if (life !== "active") return life === "stopping" ? "owner" : "replaced";
    const beat = verdict(await deps.beat(wait ? { state: "waiting", waitReason: wait.reason } : { state: "idle" }));
    if (beat.transient) {
      if (++transient >= REQUEST_FAILURE_LIMIT) return "error";
      await sleepActive(interval);
      continue;
    }
    transient = 0;
    if (beat.stop) return beat.stop;
    if (beat.paused) { await sleepActive(interval); continue; }

    let work;
    try { work = await deps.overview(); requestFailures = 0; }
    catch (error) {
      deps.log(`pipeline_next failed: ${error?.message ?? error}`);
      if (++requestFailures >= REQUEST_FAILURE_LIMIT) return "error";
      await sleepActive(interval);
      continue;
    }
    if (!hasWork(work) && !wait) { await sleepActive(interval); continue; }

    // 실행 직전 검사(B-2 2). 대기는 같은 이유가 이어지는 동안 알림을 다시 띄우지 않는다.
    const tree = deps.tree();
    const reason = tree.branch !== branch ? "branch" : tree.dirty.length > 0 ? "dirty" : null;
    if (reason) {
      if (!wait || wait.reason !== reason) deps.notify(waitNotice(reason, tree));
      wait = { reason };
      Object.assign(status, { state: "waiting", waitReason: reason, waitFiles: tree.dirty.slice(0, FILES_SHOWN) });
      save();
      await sleepActive(interval);
      continue;
    }
    wait = null;
    Object.assign(status, { state: "idle", waitReason: null, waitFiles: [], interrupted: null });
    if (!hasWork(work)) { save(); await sleepActive(interval); continue; }

    const before = workSignature(work);
    Object.assign(status, { state: "working" });
    save();
    const run = deps.startRun();
    let endedFor = null, stopAfter = null, pausedDuringRun = false;
    let finished = false;
    const done = run.done.then(end => { finished = true; return end; });
    const started = deps.now();
    // 실행 중: 60초마다 working 신호, 브랜치 감시(결정 B4), 시간 상한, 멈춤 요청.
    while (!finished) {
      const result = verdict(await deps.beat({ state: "working" }));
      if (result.paused) pausedDuringRun = true;
      if (result.stop && !stopAfter) stopAfter = result.stop;
      if (deps.lifecycle() !== "active" && !stopAfter) stopAfter = deps.lifecycle() === "stopping" ? "owner" : "replaced";
      if (!endedFor && deps.tree().branch !== branch) { endedFor = "branch"; run.end("branch"); }
      if (!endedFor && deps.now() - started >= runLimit) { endedFor = "timeout"; run.end("timeout"); }
      // 실행이 끝나면 기다림도 끝낸다 — 남은 타이머가 프로세스 종료를 붙잡지 않게.
      const pause = new AbortController();
      await Promise.race([done, deps.sleep(interval, pause.signal)]);
      pause.abort();
    }
    const end = await done;
    const { outcome, line } = classifyRun({ ...end, endedFor: endedFor ?? end.endedFor });
    Object.assign(status, { state: "idle", lastResult: line, lastLog: end.log });

    // 진전 판정: 실행 앞뒤의 작업 서명. 알 수 없으면 세지 않는다.
    let progressed = null;
    try { progressed = workSignature(await deps.overview()) !== before; } catch { progressed = null; }
    if (outcome === "branch") { /* 사용자가 만든 상황 — 실패로 세지 않는다(결정 B4) */ }
    else if (outcome !== "success") { failures++; failureKinds.push("error"); }
    else if (progressed === false) { failures++; failureKinds.push("stuck"); }
    else { failures = 0; failureKinds = []; }

    const after = deps.tree();
    if (outcome !== "success" && after.dirty.length > 0) status.interrupted = { log: end.log };
    if (outcome === "branch") {
      deps.notify(fillNotice("branchEnded", { branch, current: after.current }));
      // 이 알림이 브랜치 대기의 시작이다 — 다음 검사에서 대기 알림을 다시 띄우지 않는다.
      wait = { reason: "branch" };
      Object.assign(status, { state: "waiting", waitReason: "branch", waitFiles: after.dirty.slice(0, FILES_SHOWN) });
    }
    save();
    if (!stopAfter || stopAfter === "owner") {
      const report = await deps.beat({ state: wait ? "waiting" : "idle", ...(wait ? { waitReason: wait.reason } : {}),
        lastResult: line, ...(end.log ? { lastLog: end.log } : {}) });
      const settled = verdict(report);
      if (settled.stop && !stopAfter) stopAfter = settled.stop;
      // 일시 정지 중에 끝났다 — 이제 편집해도 된다(결정 B5).
      if (pausedDuringRun && settled.paused) deps.notify(fillNotice("pausedFinished", { branch }));
    }
    if (failures >= FAILURE_LIMIT) return failureKinds.every(kind => kind === "stuck") ? "stuck" : "error";
    if (stopAfter) return stopAfter;
  }
}
