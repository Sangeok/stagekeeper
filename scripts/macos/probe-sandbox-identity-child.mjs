import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const [mode, root, kind] = process.argv.slice(2);
const scratch = path.join(root, "scratch"), self = process.argv[1];
const record = (name, value) => fs.writeFileSync(path.join(scratch, name), JSON.stringify(value));
const watch = (child, name) => child.on("error", error => fs.appendFileSync(path.join(scratch, "errors.jsonl"), JSON.stringify({ name, code: error.code ?? null }) + "\n"));
const detach = (file, args, name) => { const child = spawn(file, args, { detached: true, stdio: "ignore" }); watch(child, name); child.unref(); return child; };
const keep = () => setInterval(() => {}, 1000);

async function attack() {
  while (!fs.existsSync(path.join(scratch, "released"))) await new Promise(resolve => setTimeout(resolve, 100));
  const config = JSON.parse(fs.readFileSync(path.join(path.dirname(self), "attack.json"), "utf8"));
  const results = {};
  const attempt = (name, action) => {
    try { results[name] = { allowed: true, value: action() ?? null }; }
    catch (error) { results[name] = { allowed: false, code: error.code ?? null }; }
  };
  attempt("writeCheckout", () => fs.writeFileSync(path.join(root, "checkout", "escaped.txt"), "escaped"));
  attempt("readSecret", () => fs.readFileSync(path.join(root, "foreign", "secret"), "utf8").length);
  attempt("writeLaunchAgent", () => fs.writeFileSync(path.join(config.home, "Library", "LaunchAgents", `${config.label}.plist`), "<plist/>"));
  attempt("signalControl", () => process.kill(config.control, "SIGCONT"));
  const run = (name, file, args) => {
    const result = spawnSync(file, args, { encoding: "utf8", timeout: 15000 });
    results[name] = { status: result.status, signal: result.signal, error: result.error?.code ?? null, stderr: (result.stderr ?? "").slice(0, 400) };
  };
  run("launchctlSubmit", "/bin/launchctl", ["submit", "-l", config.label, "--", process.execPath, self, "escaped", root, "launchd"]);
  run("nestedSandbox", "/usr/bin/sandbox-exec", ["-p", "(version 1)(allow default)", process.execPath, self, "escaped", root, "nested"]);
  fs.writeFileSync(path.join(scratch, "cron.txt"), `* * * * * ${process.execPath} ${self} escaped ${root} cron\n`);
  run("crontab", "/usr/bin/crontab", [path.join(scratch, "cron.txt")]);
  run("open", "/usr/bin/open", ["-g", "-j", "-a", "Calculator"]);
  results.network = await new Promise(resolve => {
    const socket = net.connect({ host: "127.0.0.1", port: config.port });
    socket.once("connect", () => { socket.destroy(); resolve({ allowed: true }); });
    socket.once("error", error => resolve({ allowed: false, code: error.code ?? null }));
    socket.setTimeout(3000, () => { socket.destroy(); resolve({ allowed: null, code: "timeout" }); });
  });
  record("attacks.json", results);
}

if (mode === "leader") {
  for (const survivor of ["detached", "attacker", "spawner"]) detach(process.execPath, [self, "survivor", root, survivor], survivor);
  watch(spawn(process.execPath, [self, "intermediate", root], { stdio: "ignore" }), "intermediate");
  record("oracle-exec.json", { pid: detach("/bin/sleep", ["300"], "exec").pid ?? null });
  record("leader.json", { pid: process.pid });
  keep();
} else if (mode === "intermediate") {
  detach(process.execPath, [self, "survivor", root, "orphan"], "orphan");
  setTimeout(() => process.exit(0), 200);
} else if (mode === "survivor") {
  record(`oracle-${kind}.json`, { pid: process.pid });
  if (kind === "spawner") {
    let count = 0;
    const timer = setInterval(() => {
      if (count++ >= 400) { clearInterval(timer); return; }
      const pid = detach("/bin/sleep", ["300"], "spawned").pid ?? null;
      fs.appendFileSync(path.join(scratch, "spawned.jsonl"), JSON.stringify({ pid }) + "\n");
    }, 100);
  }
  if (kind === "attacker") attack().catch(error => record("attacks.json", { failed: String(error?.message ?? error).slice(0, 400) }));
  keep();
} else if (mode === "escaped") {
  fs.writeFileSync(path.join(root, "outside", `escaped-${kind}`), String(process.pid));
} else throw new Error("Unknown probe mode");
