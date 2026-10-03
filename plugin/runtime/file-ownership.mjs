import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, realpathSync, mkdirSync, readFileSync, writeFileSync, openSync, closeSync, fstatSync, renameSync, unlinkSync, rmdirSync } from "node:fs";
import { dirname, resolve, relative, sep, isAbsolute, join } from "node:path";

export function safeTarget(root, name) {
  const base = resolve(root), target = resolve(base, name), rel = relative(base, target);
  const physical = realpathSync(base);
  if ((process.platform === "win32" ? physical.toLowerCase() !== base.toLowerCase() : physical !== base) || lstatSync(base).isSymbolicLink()) throw new Error("Symlink output root refused");
  if (!rel || rel === ".." || rel.startsWith(".." + sep) || isAbsolute(rel)) throw new Error("Generated path escapes the root");
  let current = base;
  for (const segment of rel.split(sep)) {
    current = join(current, segment);
    try { if (lstatSync(current).isSymbolicLink()) throw new Error(`Symlink output refused: ${name}`); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  return target;
}

export function atomicWrite(target, body) {
  const temporary = target + ".tmp";
  const descriptor = openSync(temporary, "wx", 0o600);
  let identity, open = true, renamed = false;
  try {
    const handle = fstatSync(descriptor, { bigint: true });
    identity = lstatSync(temporary, { bigint: true });
    if (identity.ino !== handle.ino || identity.isSymbolicLink()) throw new Error("Temporary ownership changed");
    writeFileSync(descriptor, body, "utf8");
    const current = lstatSync(temporary, { bigint: true });
    if (current.ino !== identity.ino || current.dev !== identity.dev || current.isSymbolicLink()) throw new Error("Temporary ownership changed");
    closeSync(descriptor); open = false;
    renameSync(temporary, target); renamed = true;
  } finally {
    if (open) closeSync(descriptor);
    if (!renamed && identity && existsSync(temporary)) {
      const current = lstatSync(temporary, { bigint: true });
      if (!current.isSymbolicLink() && current.ino === identity.ino && current.dev === identity.dev) unlinkSync(temporary);
    }
  }
}

export async function acquireInitGuard(root) {
  const guard = safeTarget(root, "harness.init.guard");
  const owner = join(guard, "owner.json"), nonce = randomUUID(), deadline = Date.now() + 5000;
  while (true) {
    try { mkdirSync(guard); break; }
    catch (error) {
      if (error.code !== "EEXIST") throw error;
      if (Date.now() >= deadline) throw new Error("Another init owns harness.init.guard; stop its process before explicit recovery");
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  const identity = lstatSync(guard, { bigint: true });
  try { writeFileSync(owner, JSON.stringify({ pid: process.pid, nonce }) + "\n", { flag: "wx" }); }
  catch (error) { rmdirSync(guard); throw error; }
  return () => {
    if (!existsSync(guard) || !existsSync(owner)) return;
    const current = lstatSync(guard, { bigint: true });
    if (current.isSymbolicLink() || current.ino !== identity.ino || current.dev !== identity.dev) return;
    if (JSON.parse(readFileSync(owner, "utf8")).nonce !== nonce) return;
    unlinkSync(owner); rmdirSync(guard);
  };
}

export function writeGenerated(root, name, body) {
  const target = safeTarget(root, name);
  mkdirSync(dirname(target), { recursive: true });
  atomicWrite(target, body);
}
