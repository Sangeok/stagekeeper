import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { it } from "node:test";
import { fileURLToPath } from "node:url";
import { releaseSession, stateFiles } from "../runtime/local-session.mjs";

const BIN = fileURLToPath(new URL("./harness-watch.mjs", import.meta.url));
const TOKEN = "hu_" + "a".repeat(43);
const VERSION = "012345abcdef";
const COPY = readFileSync(new URL("../../docs/conventions/product-copy.md", import.meta.url), "utf8");
const CONFIG = { version: 1, project: { owner: "owner", repo: "repo", branch: "main", slug: "owner-repo" },
  workspaces: [{ id: "app", path: ".", agent: "dev", verify: ["npm test"] }] };
const IDENTITY = { owner: "OWNER", repo: "REPO", slug: "owner-repo", available: true };
const EMPTY = { head: { action: "none", reason: "No work." }, items: [] };
const READY = { ...EMPTY, items: [{ key: "ITEM-01", node: "plan", version: 1, action: "dispatch", agent: "dev", hint: "Plan.", format: null }] };
const BASE_ENV = { ...process.env };
for (const key of Object.keys(BASE_ENV)) if (key.startsWith("HARNESS_") || key.startsWith("DOTENV_CONFIG_") || key === "NODE_OPTIONS" || key === "CLAUDE_PLUGIN_ROOT") delete BASE_ENV[key];
const json = (file) => JSON.parse(readFileSync(file, "utf8"));
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };

it("managed Claude watch retains stopping ownership and requires the shared release operation", async t => {
  const f = await fixture(t), start = await f.start(["--managed"]);
  assert.equal(json(f.lockPath).client, "claude"); assert.equal(json(f.lockPath).mode, "watch");
  const stopped = await f.run(["--stop", "--session", start.event.session]).result;
  assert.equal(stopped.event.event, "stopping"); assert.equal(json(f.lockPath).lifecycle, "stopping");
  assert.equal((await f.start(["--force", "--managed"])).event.event, "locked");
  assert.equal((await releaseSession(stateFiles(f.directory), start.event.session)).event, "released");
  assert.equal(existsSync(f.lockPath), false);
});

async function waitFor(predicate) {
  const expires = performance.now() + 7000;
  while (!predicate()) { if (performance.now() > expires) assert.fail("Fixture barrier timed out."); await delay(10); }
}

async function fixture(t, { config = CONFIG, body, token = TOKEN } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "harness-watch-test-"));
  const children = new Set();
  const calls = [];
  const pending = new Set();
  let handler = async (request, response) => {
    send(response, request, request.params.name === "project_get" ? IDENTITY : EMPTY);
  };
  const server = createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const request = JSON.parse(raw);
    calls.push({ request, headers: req.headers, url: req.url, method: req.method, at: performance.now() });
    const task = Promise.resolve(handler(request, res));
    pending.add(task);
    try { await task; } finally { pending.delete(task); }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: "pipe" }).trim();
  git("init", "-q");
  writeFileSync(path.join(root, "harness.json"), JSON.stringify(config));
  writeFileSync(path.join(root, "CLAUDE.md"), body ?? `Owner hash abcdef123456\n<!-- harness:runbook:start -->\nThis document is runbook version \`${VERSION}\`.\ncall({runbook: "${VERSION}"})\ncall({runbook: "${VERSION}"})\n<!-- harness:runbook:end -->\n`);
  const directory = path.join(root, ".git", "harness");
  const lockPath = path.join(directory, "watch.lock.json");
  const policyPath = path.join(directory, "watch.json");
  const run = (args, env = {}, checkout = root) => {
    const child = spawn(process.execPath, [BIN, "--root", checkout, ...args], {
      env: { ...BASE_ENV, HARNESS_TOKEN: token, HARNESS_SERVER: url, ...env }, stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
    });
    children.add(child);
    let stdout = "", stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => child.kill(), 20000);
    const result = new Promise((resolve, reject) => {
      child.on("error", reject);
      child.on("close", (code, signal) => {
        children.delete(child); clearTimeout(timer);
        if (signal) { resolve({ code, signal, stdout, stderr }); return; }
        try {
          assert.equal(stderr, "");
          assert.equal(stdout.trim().split(/\r?\n/).length, 1);
          const event = JSON.parse(stdout);
          if (event.event === "error" && event.code !== "access-refused") {
            const row = COPY.split(/\r?\n/).find((line) => line.startsWith(`| ${event.code} |`));
            assert.ok(row, `Missing product-copy reason for ${event.code}`);
            assert.equal(event.reason, row.split("|")[2].trim());
          }
          resolve({ code, event, stdout, stderr });
        } catch (error) { reject(error); }
      });
    });
    return { child, result };
  };
  t.after(async () => {
    const active = [...children];
    const closed = active.map((child) => new Promise((resolve) => child.once("close", resolve)));
    active.forEach((child) => child.kill());
    await Promise.all(closed);
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    // Never recursively remove a path outside this fixture's named absolute root.
    assert.equal(path.dirname(path.resolve(root)), path.resolve(tmpdir()));
    assert.ok(path.basename(root).startsWith("harness-watch-test-"));
    rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  });
  const start = async (extra = [], env) => (await run(["--start", "--commit", "no", "--propose", "no", ...extra], env).result);
  const poll = (session, extra = [], env) => run(["--session", session, "--interval", "0.02", "--deadline", "0.01", "--request-timeout", "0.2", ...extra], env);
  return { root, url, directory, lockPath, policyPath, calls, git, run, start, poll,
    setHandler: (value) => { handler = value; },
    snapshot: () => [lockPath, policyPath].map((file) => existsSync(file) ? readFileSync(file, "utf8") : null) };
}

function send(res, request, value, { sse = false, isError = false } = {}) {
  const envelope = { jsonrpc: "2.0", id: request.id, result: { content: [{ type: "text", text: JSON.stringify(value) }], ...(isError ? { isError: true } : {}) } };
  res.setHeader("content-type", sse ? "text/event-stream" : "application/json");
  res.end(sse ? `: keepalive\r\n\r\nevent: message\r\ndata: ${JSON.stringify(envelope)}\r\n\r\ndata: {"jsonrpc":"2.0","method":"notifications/message"}\r\n\r\n` : JSON.stringify(envelope));
}

it("starts, checks, polls matching SSE and stops with one JSON event; sends the actual checkout version and project every time", async (t) => {
  const f = await fixture(t);
  const { event } = await f.start();
  assert.equal(event.event, "started");
  assert.deepEqual(event.policy, { commit: false, propose: false });
  const checked = await f.run(["--check", "--session", event.session]).result;
  assert.equal(checked.event.event, "owned");
  assert.deepEqual(checked.event.policy, event.policy);
  f.setHandler(async (request, res) => send(res, request, READY, { sse: true }));
  const work = await f.poll(event.session).result;
  assert.equal(work.event.event, "work");
  assert.deepEqual(work.event.items, [{ key: "ITEM-01", node: "plan", version: 1, action: "dispatch", agent: "dev", format: null, entry: null }]);
  assert.equal(json(f.lockPath).poller, null);
  for (const call of f.calls) {
    assert.equal(call.url, "/api/mcp"); assert.equal(call.method, "POST");
    assert.equal(call.headers.authorization, `Bearer ${TOKEN}`);
    assert.equal(call.headers.accept, "application/json, text/event-stream");
    assert.equal(call.request.jsonrpc, "2.0"); assert.equal(call.request.method, "tools/call");
    assert.deepEqual(call.request.params.arguments, call.request.params.name === "project_get" ? { project: "owner-repo" } : { project: "owner-repo", runbook: VERSION });
  }
  assert.equal(new Set(f.calls.map((call) => call.request.id)).size, f.calls.length);
  assert.equal((await f.run(["--stop", "--session", event.session]).result).event.event, "stopped");
  assert.equal(existsSync(f.lockPath), false);
  assert.equal((await f.run(["--stop", "--session", event.session]).result).event.event, "stopped");
});

it("rejects invalid arguments before requests or state writes", async (t) => {
  const f = await fixture(t);
  for (const args of [[], ["--start"], ["--start", "--commit", "yes", "--propose", "perhaps"], ["--unknown"],
    ["--session"], ["--session", ""], ["--session", "s", "--force"], ["--start", "--stop"],
    ["--session", "s", "--session", "s"], ...["NaN", "Infinity", "0", "-1"].map((value) => ["--session", "s", "--interval", value]),
    ["--session", "s", "--deadline", "111"], ["--session", "s", "--request-timeout", "21"]]) {
    const result = await f.run(args).result;
    assert.equal(result.code, 1); assert.equal(result.event.code, "invalid-arguments");
    assert.equal(result.event.reason, "Invalid watch arguments. Check the mode, required values, and positive timing limits.");
  }
  assert.equal(f.calls.length, 0); assert.equal(existsSync(f.directory), false);
});

it("rejects token shape, owner tokens, missing user slug and forbidden server URLs without writes", async (t) => {
  const f = await fixture(t);
  for (const token of ["", "ho_" + "a".repeat(43), "hu_" + "a".repeat(40), "hu_" + "a".repeat(42), "hu_" + "a".repeat(44), "hu_" + "!".repeat(43)]) {
    assert.equal((await f.start([], { HARNESS_TOKEN: token })).event.code, "invalid-token");
  }
  for (const url of ["ftp://localhost", "http://u:p@localhost", "http://localhost?token=x", "http://localhost#x", "not-a-url"]) {
    assert.equal((await f.start(["--server", url])).event.code, "invalid-config");
  }
  assert.equal((await f.start([], { HARNESS_SERVER: "" })).event.code, "missing-server");
  writeFileSync(path.join(f.root, "harness.json"), JSON.stringify({ ...CONFIG, project: { owner: "owner", repo: "repo", branch: "main" } }));
  assert.equal((await f.start()).event.code, "missing-project");
  assert.equal(f.calls.length, 0); assert.equal(existsSync(f.directory), false);
});

it("supports legacy hs_ without slug/version and normalizes an explicit endpoint over the environment", async (t) => {
  const f = await fixture(t, { config: { ...CONFIG, project: { owner: "owner", repo: "repo", branch: "main" } }, body: "Legacy runbook.", token: "hs_" + "a".repeat(43) });
  const { event } = await f.start(["--server", `${f.url}/api/mcp/owner/`], { HARNESS_SERVER: "https://invalid.example" });
  assert.equal(event.event, "started");
  f.setHandler(async (request, res) => send(res, request, { ...READY, runbook: { stale: true, note: "Run init." } }));
  const work = await f.poll(event.session).result;
  assert.equal(work.event.runbookStale, true);
  assert.deepEqual(f.calls.map((call) => call.request.params.arguments), [{}, {}]);
});

it("rejects inconsistent/damaged managed version declarations and markers before IO", async (t) => {
  const f = await fixture(t);
  for (const body of [
    '<!-- harness:runbook:start -->runbook: "012345abcdef"',
    '<!-- harness:runbook:end --><!-- harness:runbook:start -->',
    '<!-- harness:runbook:start --><!-- harness:runbook:start --><!-- harness:runbook:end -->',
    '<!-- harness:runbook:start -->runbook: "012345abcdef" runbook: "abcdef012345"<!-- harness:runbook:end -->',
    '<!-- harness:runbook:start -->This document is runbook version `WRONG`<!-- harness:runbook:end -->',
    '<!-- harness:runbook:start -->runbook: "broken<!-- harness:runbook:end -->',
  ]) {
    writeFileSync(path.join(f.root, "CLAUDE.md"), body);
    assert.equal((await f.start()).event.code, "invalid-config");
  }
  assert.equal(f.calls.length, 0); assert.equal(existsSync(f.directory), false);
});

it("refuses mismatched/unavailable/incomplete project_get bodies before lock or policy creation", async (t) => {
  const f = await fixture(t);
  for (const [body, code] of [[{ ...IDENTITY, repo: "foreign" }, "identity-mismatch"],
    [{ ...IDENTITY, slug: "foreign" }, "identity-mismatch"], [{ ...IDENTITY, available: false, reason: "Not selected." }, "access-refused"],
    [{ owner: "owner", repo: "repo", slug: "owner-repo" }, "protocol-error"]]) {
    f.setHandler(async (request, res) => send(res, request, body));
    assert.equal((await f.start()).event.code, code);
    assert.equal(existsSync(f.directory), false);
  }
});

it("serializes concurrent starts and rejects a live duplicate poller without network or releasing its lock", async (t) => {
  const f = await fixture(t);
  const starts = await Promise.all([f.start(), f.start()]);
  assert.deepEqual(starts.map((result) => result.event.event).sort(), ["locked", "started"]);
  const session = starts.find((result) => result.event.event === "started").event.session;
  const release = deferred();
  f.setHandler(async (request, res) => { await release.promise; send(res, request, READY); });
  t.after(() => release.resolve());
  const first = f.run(["--session", session, "--deadline", "0.1"]);
  await waitFor(() => f.calls.length === 3);
  const before = f.snapshot();
  assert.equal((await f.poll(session).result).event.code, "poller-active");
  assert.deepEqual(f.snapshot(), before); assert.equal(f.calls.length, 3);
  release.resolve();
  assert.equal((await first.result).event.event, "work");
});

it("discards delayed work after force; old response/cleanup/stop cannot change the successor's bytes", async (t) => {
  const f = await fixture(t);
  const session = (await f.start()).event.session;
  const release = deferred();
  f.setHandler(async (request, res) => {
    if (request.params.name === "pipeline_next") await release.promise;
    send(res, request, request.params.name === "project_get" ? IDENTITY : READY);
  });
  t.after(() => release.resolve());
  const old = f.run(["--session", session, "--deadline", "0.1"]);
  await waitFor(() => f.calls.length === 2);
  const successor = (await f.start(["--force"])).event;
  const before = f.snapshot();
  const result = await old.result; // Local ownership monitoring aborts the still-hung request.
  assert.equal(result.event.event, "replaced");
  release.resolve();
  assert.deepEqual(f.snapshot(), before);
  assert.equal((await f.run(["--stop", "--session", session]).result).event.event, "replaced");
  assert.deepEqual(f.snapshot(), before); assert.equal(json(f.lockPath).id, successor.session);
});

it("stops a hung poller and can stop its own session after all config/environment inputs disappear", async (t) => {
  const f = await fixture(t);
  const session = (await f.start()).event.session;
  f.setHandler(async () => {});
  const poller = f.run(["--session", session, "--deadline", "0.1"]);
  await waitFor(() => f.calls.length === 2);
  rmSync(path.join(f.root, "harness.json")); rmSync(path.join(f.root, "CLAUDE.md"));
  const stopped = await f.run(["--stop", "--session", session], { HARNESS_TOKEN: "", HARNESS_SERVER: "" }).result;
  assert.equal(stopped.event.event, "stopped");
  assert.equal((await poller.result).event.event, "replaced");
  assert.equal(existsSync(f.lockPath), false); assert.equal(existsSync(f.policyPath), false);
});

it("checks binding without repeat changes, rejects changed config/token, and preserves corrupted state even on force/stop", async (t) => {
  const f = await fixture(t);
  const session = (await f.start()).event.session;
  const initialState = json(f.lockPath).state;
  assert.equal((await f.run(["--check", "--session", session]).result).event.event, "owned");
  assert.deepEqual(json(f.lockPath).state, initialState);
  const before = f.snapshot();
  assert.equal((await f.run(["--check", "--session", session], { HARNESS_TOKEN: "hu_" + "b".repeat(43) }).result).event.code, "binding-changed");
  assert.deepEqual(f.snapshot(), before);
  writeFileSync(path.join(f.root, "harness.json"), JSON.stringify(CONFIG) + "\n");
  assert.equal((await f.run(["--check", "--session", session]).result).event.code, "binding-changed");
  assert.deepEqual(f.snapshot(), before);
  writeFileSync(f.policyPath, JSON.stringify({ schemaVersion: 1, session, commit: "yes", propose: false }));
  const corrupt = f.snapshot();
  for (const args of [["--check", "--session", session], ["--stop", "--session", session]]) {
    assert.equal((await f.run(args).result).event.code, "corrupt-state"); assert.deepEqual(f.snapshot(), corrupt);
  }
  assert.equal((await f.start(["--force"])).event.code, "corrupt-state"); assert.deepEqual(f.snapshot(), corrupt);
});

it("preserves idle repeat state, resets on an observed empty set, and stops on the third returned work set", async (t) => {
  const f = await fixture(t);
  const session = (await f.start()).event.session;
  f.setHandler(async (request, res) => send(res, request, READY));
  assert.equal((await f.poll(session).result).event.event, "work");
  assert.equal((await f.poll(session).result).event.event, "work");
  f.setHandler(async (request, res) => send(res, request, EMPTY));
  assert.equal((await f.poll(session).result).event.event, "idle");
  assert.deepEqual(json(f.lockPath).state, { lastSignature: null, repeats: 0, stuck: false });
  f.setHandler(async (request, res) => send(res, request, READY));
  for (const expected of ["work", "work", "stuck"]) assert.equal((await f.poll(session).result).event.event, expected);
  assert.equal(existsSync(f.lockPath), false); assert.equal(existsSync(f.policyPath), false);
  assert.equal(readdirSync(f.directory).length, 0);
});

it("uses the shared common Git directory while refusing reuse from a linked checkout", async (t) => {
  const f = await fixture(t);
  f.git("-c", "user.name=Watch Fixture", "-c", "user.email=fixture@example.invalid", "add", "harness.json", "CLAUDE.md");
  f.git("-c", "user.name=Watch Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "fixture");
  const linked = path.join(f.root, "linked checkout's space");
  f.git("worktree", "add", "--detach", linked, "HEAD");
  const session = (await f.start()).event.session;
  assert.equal((await f.run(["--start", "--commit", "no", "--propose", "no"], {}, linked).result).event.event, "locked");
  assert.equal((await f.run(["--check", "--session", session], {}, linked).result).event.code, "binding-changed");
  assert.equal((await f.run(["--stop", "--session", session], { HARNESS_TOKEN: "", HARNESS_SERVER: "" }, linked).result).event.event, "stopped");
});

it("bounds hung fetch/body and Retry-After by the deadline, aborts readers and leaves an idle session without a poller", async (t) => {
  for (const mode of ["fetch", "body", "retry-after"]) {
    const f = await fixture(t);
    const session = (await f.start()).event.session;
    f.setHandler(async (_request, res) => {
      if (mode === "body") { res.writeHead(200, { "content-type": "text/event-stream" }); res.write(": keepalive\n\n"); }
      if (mode === "retry-after") { res.writeHead(429, { "retry-after": "3600" }); res.end(); }
    });
    const started = performance.now();
    const result = await f.run(["--session", session, "--interval", "0.02", "--deadline", "0.003", "--request-timeout", "0.2"]).result;
    assert.equal(result.event.event, "idle");
    assert.ok(performance.now() - started < 1600, "180ms internal deadline plus process/OS overhead");
    assert.equal(json(f.lockPath).poller, null);
  }
});

it("counts five consecutive transient failures, resets after success, and retries no faster than interval", async (t) => {
  const f = await fixture(t);
  const session = (await f.start()).event.session;
  let number = 0;
  f.setHandler(async (request, res) => {
    number++;
    if (number === 3) send(res, request, EMPTY);
    else { res.writeHead(number % 2 === 0 ? 408 : 503); res.end(); }
  });
  const result = await f.run(["--session", session, "--interval", "0.03", "--deadline", "0.1", "--request-timeout", "0.2"]).result;
  assert.equal(result.event.code, "request-failed"); assert.equal(number, 8);
  const calls = f.calls.slice(1);
  for (let i = 1; i < calls.length; i++) assert.ok(calls[i].at - calls[i - 1].at >= 20);
  assert.equal(existsSync(f.lockPath), false);
});

it("fails closed on fatal HTTP/RPC/tool/schema/oversize responses without reflecting secrets or following redirects", async (t) => {
  const f = await fixture(t);
  for (const mode of ["401", "403", "404", "redirect", "rpc", "tool", "schema", "oversize"]) {
    f.setHandler(async (request, res) => send(res, request, IDENTITY));
    const session = (await f.start()).event.session;
    f.setHandler(async (request, res) => {
      if (/^\d+$/.test(mode)) { res.writeHead(Number(mode), { "content-type": "application/json" }); res.end(JSON.stringify({ error: `Bearer ${TOKEN}` })); }
      else if (mode === "redirect") { res.writeHead(302, { location: `${f.url}/stolen` }); res.end(); }
      else if (mode === "tool") send(res, request, { error: `Secret ${TOKEN}` }, { isError: true });
      else if (mode === "schema") send(res, request, { items: [] });
      else { res.setHeader("content-type", "application/json"); res.end(mode === "oversize" ? "x".repeat(1024 * 1024 + 1) : JSON.stringify({ jsonrpc: "2.0", id: request.id, error: { code: -1, message: TOKEN } })); }
    });
    const before = f.calls.length;
    const result = await f.poll(session).result;
    assert.equal(result.code, 1); assert.equal(result.event.event, "error");
    assert.equal(f.calls.length, before + 1);
    assert.ok(!result.stdout.includes(TOKEN)); assert.ok(!result.stdout.includes("Bearer"));
    assert.equal(existsSync(f.lockPath), false); assert.equal(existsSync(f.policyPath), false);
  }
});

it("leaves an abandoned guard untouched and requires explicit force for an expired session", async (t) => {
  const f = await fixture(t);
  const session = (await f.start()).event.session;
  const lock = json(f.lockPath); lock.seenAt = "2020-01-01T00:00:00.000Z";
  writeFileSync(f.lockPath, JSON.stringify(lock));
  assert.equal((await f.start()).event.event, "locked");
  assert.equal(json(f.lockPath).id, session);
  mkdirSync(path.join(f.directory, "watch.guard"));
  const before = f.snapshot();
  const result = await f.run(["--check", "--session", session]).result;
  assert.equal(result.event.code, "guard-busy"); assert.deepEqual(f.snapshot(), before);
  assert.equal(existsSync(path.join(f.directory, "watch.guard")), true);
});

it("recovers only a provably dead poller and preserves a live or unknown PID", async (t) => {
  const f = await fixture(t);
  const session = (await f.start()).event.session;
  const exited = spawn(process.execPath, ["-e", ""], { windowsHide: true });
  const deadPid = exited.pid;
  await new Promise((resolve) => exited.once("close", resolve));
  let lock = json(f.lockPath);
  lock.poller = { pid: process.pid, nonce: "live-owner" };
  writeFileSync(f.lockPath, JSON.stringify(lock));
  const before = f.snapshot();
  assert.equal((await f.poll(session).result).event.code, "poller-active");
  assert.deepEqual(f.snapshot(), before);
  lock.poller = { pid: deadPid, nonce: "dead-owner" };
  writeFileSync(f.lockPath, JSON.stringify(lock));
  f.setHandler(async (request, res) => send(res, request, READY));
  assert.equal((await f.poll(session).result).event.event, "work");
  assert.equal(json(f.lockPath).poller, null);
});

it("retries five request/body timeouts and removes only its own terminal state", async (t) => {
  for (const body of [false, true]) {
    const f = await fixture(t);
    const session = (await f.start()).event.session;
    f.setHandler(async (_request, res) => {
      if (body) { res.writeHead(200, { "content-type": "text/event-stream" }); res.write(": keepalive\n\n"); }
    });
    // Allow a fresh Node process to connect before testing its five response timeouts.
    const result = await f.run(["--session", session, "--interval", "0.01", "--deadline", "0.1", "--request-timeout", "0.2"]).result;
    assert.equal(result.event.code, "request-failed");
    assert.equal(f.calls.length, 6);
    assert.equal(existsSync(f.lockPath), false);
    assert.equal(readdirSync(f.directory).length, 0);
  }
});

it("honors a longer Retry-After, and a healthy overview restarts failure counting", async (t) => {
  const f = await fixture(t);
  const session = (await f.start()).event.session;
  let count = 0;
  f.setHandler(async (request, res) => {
    if (++count === 1) { res.writeHead(429, { "retry-after": "0.2" }); res.end(); }
    else send(res, request, READY);
  });
  assert.equal((await f.poll(session).result).event.event, "work");
  assert.ok(f.calls[2].at - f.calls[1].at >= 190);
});

it("refuses non-Git/bare roots, malformed config and missing runbook without network/state writes", async (t) => {
  const f = await fixture(t);
  const plain = path.join(f.root, "plain"); mkdirSync(plain);
  const bare = path.join(f.root, "bare"); f.git("init", "--bare", "-q", bare);
  for (const checkout of [path.join(f.root, "absent"), bare]) {
    assert.equal((await f.run(["--start", "--commit", "no", "--propose", "no"], {}, checkout).result).event.code, "invalid-config");
  }
  assert.equal((await f.run(["--start", "--commit", "no", "--propose", "no"], { GIT_CEILING_DIRECTORIES: f.root }, plain).result).event.code, "invalid-config");
  writeFileSync(path.join(f.root, "harness.json"), "{");
  assert.equal((await f.start()).event.code, "invalid-config");
  writeFileSync(path.join(f.root, "harness.json"), JSON.stringify(CONFIG)); rmSync(path.join(f.root, "CLAUDE.md"));
  assert.equal((await f.start()).event.code, "invalid-config");
  assert.equal(f.calls.length, 0); assert.equal(existsSync(f.directory), false);
});

it("does not reflect the known token through actionable identifiers or write it to state", async (t) => {
  const f = await fixture(t);
  const session = (await f.start()).event.session;
  f.setHandler(async (request, res) => send(res, request, { ...READY, items: [{ ...READY.items[0], key: TOKEN }] }));
  const result = await f.poll(session).result;
  assert.equal(result.event.code, "protocol-error"); assert.ok(!result.stdout.includes(TOKEN));
  assert.equal(readdirSync(f.directory).length, 0);
});

it("runs the real CLI with shell-safe plugin/root arguments containing spaces and apostrophes, without a plugin-root environment variable", async (t) => {
  const f = await fixture(t);
  const pluginRoot = path.join(f.root, "plugin's space");
  mkdirSync(path.join(pluginRoot, "bin"), { recursive: true });
  mkdirSync(path.join(pluginRoot, "lib"));
  mkdirSync(path.join(pluginRoot, "runtime"));
  for (const name of ["local-session", "file-ownership"]) copyFileSync(fileURLToPath(new URL(`../runtime/${name}.mjs`, import.meta.url)), path.join(pluginRoot, "runtime", `${name}.mjs`));
  const cli = path.join(pluginRoot, "bin", "harness-watch.mjs");
  copyFileSync(BIN, cli);
  for (const name of ["watch", "config", "token", "runbook", "workspaces", "entitlement"]) {
    copyFileSync(fileURLToPath(new URL(`../lib/${name}.mjs`, import.meta.url)), path.join(pluginRoot, "lib", `${name}.mjs`));
  }
  const session = (await f.start()).event.session;
  const quoteBash = (value) => "'" + value.replaceAll("'", "'\"'\"'") + "'";
  const quotePS = (value) => "'" + value.replaceAll("'", "''") + "'";
  const shells = process.platform === "win32"
    ? [["powershell.exe", ["-NoProfile", "-NonInteractive", "-Command"], quotePS],
      [path.join(process.env.ProgramFiles ?? "C:/Program Files", "Git", "bin", "bash.exe"), ["-c"], quoteBash]]
    : [["/bin/bash", ["-c"], quoteBash]];
  for (const [program, prefix, quote] of shells) {
    if (path.isAbsolute(program) && !existsSync(program)) { t.diagnostic(`Shell unavailable: ${program}`); continue; }
    const command = [process.platform === "win32" && program === "powershell.exe" ? "&" : "",
      quote(process.execPath), quote(cli), "--root", quote(f.root), "--check", "--session", quote(session)].filter(Boolean).join(" ");
    const child = spawn(program, [...prefix, command], { env: { ...BASE_ENV, HARNESS_TOKEN: TOKEN, HARNESS_SERVER: f.url }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; }); child.stderr.on("data", (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => child.kill(), 10000);
    try {
      const code = await new Promise((resolve, reject) => { child.once("close", resolve); child.once("error", reject); });
      assert.equal(code, 0, stderr); assert.equal(stderr, "");
      assert.equal(stdout.trim().split(/\r?\n/).length, 1);
      assert.equal(JSON.parse(stdout).event, "owned");
    } finally { clearTimeout(timer); if (child.exitCode === null) child.kill(); }
  }
});

it("preserves state-free startup when config changes while project_get is in flight", async (t) => {
  const f = await fixture(t);
  const release = deferred();
  t.after(() => release.resolve());
  f.setHandler(async (request, res) => { await release.promise; send(res, request, IDENTITY); });
  const start = f.start();
  await waitFor(() => f.calls.length === 1);
  writeFileSync(path.join(f.root, "harness.json"), JSON.stringify(CONFIG) + "\n");
  release.resolve();
  assert.equal((await start).event.code, "binding-changed");
  assert.equal(existsSync(f.lockPath), false); assert.equal(existsSync(f.policyPath), false);
});
