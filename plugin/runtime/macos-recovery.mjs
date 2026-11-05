import { rm } from "node:fs/promises";
import path from "node:path";
import { isAlive, lifecycleOf, readStateWithGuard, recordedChildren, settleChild } from "./local-session.mjs";
import { installedMacosRuntime } from "./macos-runtime.mjs";
import { endSandbox } from "./macos/sandbox.mjs";

export async function recoverMacosCommands(files, session) {
  if (process.platform !== "darwin") return;
  const state = await readStateWithGuard(files);
  if (!state || state.lock.id !== session || lifecycleOf(state) !== "stopping") return;
  const children = recordedChildren(state.lock).filter(child => child.sandbox?.kind === "macos-seatbelt-v1");
  if (!children.length) return;
  const runtime = installedMacosRuntime();
  for (const child of children) {
    if (isAlive(child.pid)) continue;
    const current = await readStateWithGuard(files);
    if (!current || current.lock.id !== session || lifecycleOf(current) !== "stopping") return;
    endSandbox(child.sandbox.root, child.nonce, path.join(runtime.directory, "sandbox-identity"));
    const settled = await settleChild(files, session, child);
    if (settled.event === "settled") await rm(child.sandbox.root, { recursive: true });
  }
}
