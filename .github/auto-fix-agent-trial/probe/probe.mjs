import { spawn } from "node:child_process";
import http from "node:http";

const server = http.createServer((_, response) => response.end("ok"));
const finish = text => {
  console.log(text);
  server.close();
  process.exit(0);
};
setTimeout(() => finish("timeout"), 10_000);
server.on("error", () => finish("listen-denied"));
server.listen(0, "127.0.0.1", () => {
  const { port } = server.address();
  const child = spawn(process.execPath, ["-e", `require("node:http").get("http://127.0.0.1:${port}",r=>{r.resume();r.on("end",()=>process.exit(0))}).on("error",()=>process.exit(1))`]);
  child.on("exit", code => finish(code === 0 ? "ok" : "connect-denied"));
});
