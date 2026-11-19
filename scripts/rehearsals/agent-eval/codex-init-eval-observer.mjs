import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";

export const dryRunHelper = "stagekeeper-eval-dry-run";
export const planned = "planned: no installation changes";
export const preserved = "skip(modified): docs/harness/codex-runbook.md";
export const unavailable = "dry-run observation unavailable";

export function receiptOutput(call) {
  return [`eval-receipt: ${call.receipt}`, ...call.lines].join("\n");
}

export async function openDryRunObserver(turn) {
  const route = "/" + randomUUID();
  const calls = [];
  let execute, pending;
  let state = "waiting";
  let attempts = 0;
  let lost = false;
  const listener = createServer(async (request, response) => {
    const end = (status, body = "") => {
      if (response.destroyed || response.headersSent) { lost = true; return; }
      response.writeHead(status, { "Content-Type": "text/plain", "Cache-Control": "no-store", Connection: "close" });
      response.end(body);
    };
    response.on("error", () => { lost = true; });
    if (request.url !== route) return end(404);
    if (request.method === "GET") return end(200, turn.id);
    if (request.method !== "POST" || request.headers["transfer-encoding"] || Number(request.headers["content-length"] ?? 0) !== 0) {
      lost = true;
      return end(400);
    }
    if (state !== "active" || pending) {
      lost = true;
      return end(409);
    }
    attempts++;
    if (!execute) return end(200, "2\ndry-run target unavailable\n");
    response.on("close", () => { if (!response.writableFinished) lost = true; });
    try {
      pending = Promise.resolve().then(execute);
      const result = await pending;
      if (!Number.isInteger(result.exitCode) || result.exitCode < 0 || result.exitCode > 255 || typeof result.stdout !== "string") {
        throw new Error(unavailable);
      }
      const lines = result.stdout.split(/\r?\n/).filter(line => line === planned || line === preserved);
      const call = { receipt: randomUUID(), exitCode: result.exitCode, lines };
      calls.push(call);
      end(200, `${call.exitCode}\n${receiptOutput(call)}\n`);
    } catch {
      lost = true;
      end(503);
    } finally {
      pending = undefined;
    }
  });
  listener.on("error", () => { lost = true; });
  listener.on("clientError", (_, socket) => { lost = true; socket.destroy(); });
  listener.on("close", () => { if (state !== "sealed") lost = true; });
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  return {
    url: `http://127.0.0.1:${listener.address().port}${route}`,
    begin(runNative) {
      if (state !== "waiting") throw new Error(unavailable);
      execute = runNative;
      state = "active";
    },
    seal() {
      if (pending) lost = true;
      if (state === "active") state = "sealed";
    },
    async close(verified) {
      if (state !== "sealed") lost = true;
      state = "sealed";
      await pending?.catch(() => {});
      const listening = listener.listening;
      if (listening) {
        const stopped = new Promise(resolve => listener.close(resolve));
        listener.closeAllConnections();
        await stopped;
      }
      return { ...turn, complete: listening && verified && !lost, attempts, calls };
    },
  };
}
