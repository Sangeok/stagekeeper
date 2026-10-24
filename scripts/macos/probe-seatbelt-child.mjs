import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";

const [mode, root, port] = process.argv.slice(2);
const scratch = path.join(root, "scratch"), repository = path.join(root, "repository");
if (mode === "detached") {
  fs.writeFileSync(path.join(scratch, "detached.json"), JSON.stringify({ pid: process.pid }));
  setTimeout(() => process.exit(0), 8000);
} else if (mode === "leader") {
  const child = spawn(process.execPath, [process.argv[1], "detached", root], { detached: true, stdio: "ignore", env: process.env });
  child.unref();
  setTimeout(() => process.exit(0), 10000);
} else {
  assert.equal(fs.readFileSync(path.join(repository, "allowed.txt"), "utf8"), "allowed");
  fs.writeFileSync(path.join(scratch, `allowed-${mode}.txt`), "allowed");
  const denied = [];
  for (const name of ["foreign/secret", "owner/.codex/auth.json", "repository/.git/config", "repository/.env"]) {
    assert.throws(() => fs.readFileSync(path.join(root, name)), error => ["EPERM", "EACCES"].includes(error.code));
    assert.throws(() => fs.writeFileSync(path.join(root, name), "changed"), error => ["EPERM", "EACCES"].includes(error.code));
    denied.push(name);
  }
  assert.equal(process.env.STAGEKEEPER_PROBE_SECRET, undefined);
  await new Promise((resolve, reject) => {
    const socket = net.connect({ host: "127.0.0.1", port: Number(port) });
    socket.once("connect", () => { socket.destroy(); reject(new Error("Loopback network was allowed")); });
    socket.once("error", error => ["EPERM", "EACCES"].includes(error.code) ? resolve() : reject(error));
    socket.setTimeout(3000, () => { socket.destroy(); reject(new Error("Network denial was not acknowledged")); });
  });
  const descendant = mode === "parent" ? JSON.parse(execFileSync(process.execPath, [process.argv[1], "descendant", root, port], { encoding: "utf8", timeout: 10000 })) : null;
  console.log(JSON.stringify({ mode, allowedReadWrite: true, denied, environmentIsolated: true, networkDenied: true, descendant }));
}
