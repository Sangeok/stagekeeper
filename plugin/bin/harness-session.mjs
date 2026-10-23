#!/usr/bin/env node
import { gitRoot, stateFiles, readState, startSession, checkSession, requestStop, releaseSession } from "../runtime/local-session.mjs";
import { connectionInput, verifyProject, verifyCodexSupport } from "../runtime/mcp-client.mjs";
import { runnerCallWithin } from "../runtime/runner-client.mjs";
import { parseClient } from "../lib/execution/client-runtime.mjs";
import { parseBearer } from "../lib/tokens/token.mjs";

const RUNNER_TIMEOUT = 10000;

export function parseArguments(argv) {
  const options = {}, flags = new Set(["start", "check", "stop", "release"]), values = new Set(["root", "server", "client", "session", "commit", "propose"]);
  for (let i = 0; i < argv.length; i++) {
    const name = argv[i].startsWith("--") ? argv[i].slice(2) : "";
    if (Object.hasOwn(options, name) || (!flags.has(name) && !values.has(name))) throw new Error("Invalid session arguments");
    options[name] = flags.has(name) ? true : argv[++i];
    if (typeof options[name] === "string" && (!options[name] || options[name].startsWith("--"))) throw new Error("Missing session argument");
    if (options[name] === undefined) throw new Error("Missing session argument");
  }
  const modes = [...flags].filter(name => options[name]);
  if (modes.length !== 1) throw new Error("Select exactly one session operation");
  const mode = modes[0];
  if (mode === "start") {
    if (options.session || !["yes", "no"].includes(options.commit) || !["yes", "no"].includes(options.propose)) throw new Error("Start requires explicit commit/propose policies");
  } else if (!options.session || options.commit || options.propose) throw new Error("Operation requires session, without new policies");
  if (["stop", "release"].includes(mode) && (options.server || options.client)) throw new Error("Stop/release use the stored session without token/config/client");
  if (options.client !== undefined) parseClient(options.client);
  return { ...options, mode, root: options.root ?? "." };
}

const holdsLease = (lock, session) => lock?.id === session && lock.runnerLease === true
  && ["watch", "resident"].includes(lock.mode ?? "watch") && (lock.client ?? "claude") === "claude";

async function beatOnCheck(event, files, input) {
  if (event.event !== "owned" || !holdsLease(readState(files)?.lock, event.session)) return event;
  const result = await runnerCallWithin({ server: input.server, token: input.token, project: input.config.project.slug },
    { op: "beat", session: event.session }, RUNNER_TIMEOUT);
  if (result.kind === "ok") return { ...event, paused: result.paused };
  if (result.kind === "missing") return event;
  if (result.kind === "replaced") return { event: "replaced", session: event.session, seenAt: null };
  return { ...event, server: "unreachable" };
}

async function stopOnRelease(event, before) {
  if (event.event !== "released" || !holdsLease(before, event.session)) return;
  const token = process.env.HARNESS_TOKEN;
  if (!parseBearer(`Bearer ${token}`, "agent") && !parseBearer(`Bearer ${token}`, "user")) return;
  await runnerCallWithin({ server: before.binding.server, token, project: before.binding.project },
    { op: "stop", session: event.session, reason: "owner" }, RUNNER_TIMEOUT);
}

async function main() {
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
    const location = gitRoot(options.root), files = stateFiles(location.directory);
    let event;
    if (options.mode === "stop") event = await requestStop(files, options.session);
    else if (options.mode === "release") {
      let before = null;
      try { before = readState(files)?.lock ?? null; } catch { before = null; }
      event = await releaseSession(files, options.session);
      await stopOnRelease(event, before);
    } else {
      const client = options.client ?? (options.mode === "check" ? readState(files)?.lock.client ?? "claude" : "claude");
      const input = connectionInput(location.root, { ...options, client });
      if (options.mode === "check") event = await beatOnCheck(await checkSession(files, options.session, input.binding), files, input);
      else {
        await verifyProject(input);
        if (client === "codex") await verifyCodexSupport(input);
        event = await startSession(files, input.binding, { client, commit: options.commit === "yes", propose: options.propose === "yes", host: process.env.HARNESS_SESSION_HOST_ID ?? null });
      }
    }
    console.log(JSON.stringify(event));
    process.exitCode = event.event === "error" ? 1 : 0;
  } catch { console.log(JSON.stringify({ event: "error", session: options?.session ?? null, code: "session-refused", reason: "Invalid configuration, ownership or server response; stop and reconnect with the current client init skill." })); process.exitCode = 1; }
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/harness-session.mjs")) void main();
