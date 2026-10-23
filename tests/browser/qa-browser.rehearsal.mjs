import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, realpathSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createQaBrowser } from "../../plugin/runtime/qa-browser.mjs";

const CONNECTION_ATTEMPTS = 40;
const CONNECTION_RETRY_DELAY_MS = 250;
const BROWSER_CLOSE_TIMEOUT_MS = 5000;
const MCP_EXIT_TIMEOUT_MS = 3000;
const MAX_MCP_OUTPUT_CHARS = 16 * 1024;

const fixtureHtml = `<!doctype html>
<html>
  <head><title>QA browser fixture</title></head>
  <body>
    <h1>Disposable test environment</h1>
    <label>Name <input id="name"></label>
    <button id="save">Save</button>
    <p role="status" id="status"></p>
    <script>
      const nameInput = document.querySelector('#name');
      const statusMessage = document.querySelector('#status');

      nameInput.value = localStorage.getItem('name') || '';
      statusMessage.textContent = nameInput.value ? 'Saved ' + nameInput.value : 'Empty';

      document.querySelector('#save').onclick = () => {
        localStorage.setItem('name', nameInput.value);
        statusMessage.textContent = 'Saved ' + nameInput.value;
      };
    </script>
  </body>
</html>`;

async function listenOnLoopback(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  return server.address().port;
}

async function closeServer(server) {
  if (!server?.listening) return;
  server.closeAllConnections();
  await new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
}

async function reserveMcpPort() {
  const reservation = createServer();
  try {
    return await listenOnLoopback(reservation);
  } finally {
    await closeServer(reservation);
  }
}

async function withTimeout(operation, timeoutMs, message) {
  let timer;
  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function startPlaywrightMcp(cliPath, port, artifactsDir) {
  const child = spawn(process.execPath, [
    cliPath,
    "--host", "127.0.0.1",
    "--allowed-hosts", `127.0.0.1:${port}`,
    "--port", String(port),
    "--isolated",
    "--headless",
    "--browser", "msedge",
    "--output-dir", artifactsDir,
  ], {
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  let spawnError;
  let exit;
  const captureOutput = chunk => {
    output = (output + chunk.toString()).slice(-MAX_MCP_OUTPUT_CHARS);
  };
  child.stdout.on("data", captureOutput);
  child.stderr.on("data", captureOutput);
  child.on("error", error => {
    spawnError = error;
  });
  const closed = new Promise(resolve => {
    child.once("close", (code, signal) => {
      exit = { code, signal };
      resolve();
    });
  });

  return {
    assertRunning() {
      if (spawnError) {
        throw new Error(`Could not start Playwright MCP\n${output.trim()}`, { cause: spawnError });
      }
      if (exit) {
        const reason = exit.signal ? `signal ${exit.signal}` : `code ${exit.code}`;
        throw new Error(`Playwright MCP stopped (${reason})\n${output.trim()}`);
      }
    },
    async stop() {
      if (exit) return;
      child.kill();
      try {
        await withTimeout(closed, MCP_EXIT_TIMEOUT_MS, "Playwright MCP did not exit after SIGTERM");
      } catch {
        child.kill("SIGKILL");
        await withTimeout(closed, MCP_EXIT_TIMEOUT_MS, "Playwright MCP did not exit after SIGKILL");
      }
    },
  };
}

async function connectQaBrowser(config, mcpProcess) {
  let lastError;
  for (let attempt = 0; attempt < CONNECTION_ATTEMPTS; attempt++) {
    mcpProcess.assertRunning();
    try {
      return await createQaBrowser(config);
    } catch (error) {
      mcpProcess.assertRunning();
      lastError = error;
      if (attempt + 1 < CONNECTION_ATTEMPTS) await delay(CONNECTION_RETRY_DELAY_MS);
    }
  }
  throw new Error("Could not connect to the QA browser MCP", { cause: lastError });
}

function getSnapshotText(result) {
  return result.content
    .filter(item => item.type === "text")
    .map(item => item.text)
    .join("\n");
}

function findElementRef(snapshot, label) {
  const line = getSnapshotText(snapshot).split("\n").find(line => line.includes(label));
  const match = /\[ref=([^\]]+)\]/.exec(line ?? "");
  assert.ok(match, `Missing ${label} in actual snapshot`);
  return match[1];
}

function getElementTarget(browser, toolName, elementRef) {
  const tool = browser.tools.find(tool => tool.name === toolName);
  return tool.inputSchema.properties.target ? { target: elementRef } : { ref: elementRef };
}

async function verifyBrowserInteractions(browser, baseUrl) {
  async function callBrowserTool(name, args = {}) {
    const { mcpResult } = await browser.call(name, args);
    assert.ok(!mcpResult.isError, `${name}: ${JSON.stringify(mcpResult)}`);
    return mcpResult;
  }

  const initialPage = await callBrowserTool("browser_navigate", { url: baseUrl });
  assert.match(getSnapshotText(initialPage), /Disposable test environment/);

  const initialSnapshot = await callBrowserTool("browser_snapshot");
  await callBrowserTool("browser_type", {
    element: "Name",
    ...getElementTarget(browser, "browser_type", findElementRef(initialSnapshot, 'textbox "Name"')),
    text: "Fixture Alice",
  });

  const snapshotAfterTyping = await callBrowserTool("browser_snapshot");
  await callBrowserTool("browser_click", {
    element: "Save",
    ...getElementTarget(browser, "browser_click", findElementRef(snapshotAfterTyping, 'button "Save"')),
  });
  const savedSnapshot = await callBrowserTool("browser_snapshot");
  assert.match(getSnapshotText(savedSnapshot), /Saved Fixture Alice/);

  const reloadedPage = await callBrowserTool("browser_navigate", { url: baseUrl });
  assert.match(getSnapshotText(reloadedPage), /Saved Fixture Alice/);

  const screenshot = await callBrowserTool("browser_take_screenshot", { type: "png" });
  assert.ok(screenshot.content.some(item => item.type === "image"));

  await callBrowserTool("browser_console_messages");
  await callBrowserTool("browser_network_requests");
  assert.equal(browser.verified(), true);
  await assert.rejects(
    browser.call("browser_navigate", { url: "https://production.example" }),
    /outside test origin/,
  );
}

async function cleanupResources(browser, mcpProcess, fixtureServer) {
  const errors = [];
  async function attemptCleanup(name, cleanup) {
    try {
      await cleanup();
    } catch (error) {
      errors.push(new Error(`Failed to close ${name}`, { cause: error }));
    }
  }

  await attemptCleanup("QA browser", async () => {
    if (browser) {
      await withTimeout(browser.close(), BROWSER_CLOSE_TIMEOUT_MS, "QA browser close timed out");
    }
  });
  await attemptCleanup("Playwright MCP", () => mcpProcess?.stop());
  await attemptCleanup("fixture server", () => closeServer(fixtureServer));
  return errors;
}

const mcpCliPath = process.argv[2];
if (!mcpCliPath) throw new Error("Pass the installed @playwright/mcp cli.js path");

const artifactsDir = mkdtempSync(join(realpathSync(tmpdir()), "stagekeeper-qa-browser-"));
let fixtureServer;
let mcpProcess;
let browser;
let rehearsalError;

try {
  fixtureServer = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end(fixtureHtml);
  });
  const fixturePort = await listenOnLoopback(fixtureServer);
  const baseUrl = `http://127.0.0.1:${fixturePort}`;
  const mcpPort = await reserveMcpPort();
  mcpProcess = startPlaywrightMcp(mcpCliPath, mcpPort, artifactsDir);

  browser = await connectQaBrowser({
    environment: "test",
    baseUrl,
    mcpUrl: `http://127.0.0.1:${mcpPort}/mcp`,
    scenariosPath: "fixture-only.md",
    artifactsDir,
  }, mcpProcess);

  await verifyBrowserInteractions(browser, baseUrl);
} catch (error) {
  rehearsalError = error;
} finally {
  const cleanupErrors = await cleanupResources(browser, mcpProcess, fixtureServer);
  if (cleanupErrors.length) {
    const cleanupError = new AggregateError(cleanupErrors, "QA browser rehearsal cleanup failed");
    if (rehearsalError) console.error(cleanupError);
    else rehearsalError = cleanupError;
  }
}

if (rehearsalError) {
  console.error(`QA browser rehearsal artifacts: ${artifactsDir}`);
  throw rehearsalError;
}

console.log(JSON.stringify({
  passed: [
    "test identity",
    "snapshot refs",
    "form interaction",
    "save",
    "persist after reload",
    "screenshot image",
    "console",
    "network",
    "outside-origin refusal",
  ],
  artifacts: artifactsDir,
}));
