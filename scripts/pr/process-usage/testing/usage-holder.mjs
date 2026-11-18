import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";

const children = [];
const alive = setInterval(() => {}, 1000);
process.on("message", async message => {
  if (message?.action === "fork") {
    const child = fork(fileURLToPath(import.meta.url), [], {
      cwd: message.cwd, stdio: ["ignore", "ignore", "ignore", "ipc"],
    });
    children.push(child);
    child.once("message", ready => process.send?.({ action: "forked", ...ready }));
  } else if (message?.action === "cwd") {
    process.chdir(message.cwd);
    process.send?.({ pid: process.pid, cwd: process.cwd() });
  } else if (message?.action === "stop") {
    await Promise.all(children.map(child => new Promise(resolve => {
      child.once("exit", resolve);
      child.send({ action: "stop" });
    })));
    clearInterval(alive);
    process.disconnect();
  }
});
process.send?.({ pid: process.pid, cwd: process.cwd() });
