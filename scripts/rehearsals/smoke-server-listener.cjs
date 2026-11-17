const parentPid = Number(process.env.STAGEKEEPER_SMOKE_PARENT_PID);
if (!Number.isSafeInteger(parentPid) || parentPid <= 0) throw new Error("Invalid smoke parent PID");

if (process.ppid === parentPid) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const http = require("node:http");
  const runId = process.env.STAGEKEEPER_SMOKE_RUN_ID;
  const port = Number(process.env.STAGEKEEPER_SMOKE_PORT);
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(runId ?? "")
    || !Number.isInteger(port) || port < 1 || port > 65535 || !process.connected || typeof process.send !== "function") {
    throw new Error("Invalid smoke listener configuration");
  }
  const original = http.Server.prototype.listen;
  let sent = false;
  function listen(...args) {
    const ready = () => {
      const address = this.address();
      if (sent || !address || typeof address === "string" || address.address !== "127.0.0.1" || address.port !== port) return;
      sent = true;
      if (http.Server.prototype.listen === listen) http.Server.prototype.listen = original;
      process.send({ version: 1, event: "stagekeeper-smoke-listening", runId, pid: process.pid, host: address.address, port: address.port }, error => {
        if (error) throw error;
      });
    };
    this.once("listening", ready);
    try {
      return Reflect.apply(original, this, args);
    } catch (error) {
      this.off("listening", ready);
      throw error;
    }
  }
  http.Server.prototype.listen = listen;
}
