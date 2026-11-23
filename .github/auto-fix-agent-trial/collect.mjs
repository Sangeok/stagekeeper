import { execFileSync } from "node:child_process";
import { createCipheriv, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";

const [transcriptPath, workDir, notesPath, outDir, baseTree] = process.argv.slice(2);
const token = String(process.env.CLAUDE_CODE_OAUTH_TOKEN ?? "");
const key = Buffer.from(String(process.env.TRANSCRIPT_KEY ?? "").trim(), "base64");
if (token.length < 20) throw new Error("the model token is required for the leak scan");
if (key.length !== 32) throw new Error("the transcript key must be 32 bytes of base64");

const readText = file => (existsSync(file) ? readFileSync(file, "utf8") : "");
const git = (...args) => execFileSync("git", args, { cwd: workDir, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });

const transcript = readText(transcriptPath);
const events = transcript.split("\n").flatMap(line => {
  try {
    return line.trim() ? [JSON.parse(line)] : [];
  } catch {
    return [];
  }
});

const toolUses = events.flatMap(event =>
  event.type === "assistant" && Array.isArray(event.message?.content) ? event.message.content.filter(part => part.type === "tool_use") : [],
);
const describe = use => {
  const input = use.input ?? {};
  const target = input.command ?? input.file_path ?? input.url ?? input.pattern ?? input.query ?? input.prompt ?? "";
  return `${use.name}\t${String(target).replaceAll("\n", "\\n")}`;
};
const commands = toolUses.map(describe).join("\n");

const results = events.filter(event => event.type === "result");
const result = results.at(-1) ?? null;
const init = events.find(event => event.type === "system" && event.subtype === "init") ?? null;
const summary = {
  finished: Boolean(result),
  agentSeconds: Number(process.env.AGENT_SECONDS ?? "") || null,
  resultEvents: results.map(event => ({ subtype: event.subtype ?? null, durationMs: event.duration_ms ?? null, turns: event.num_turns ?? null, costUsd: event.total_cost_usd ?? null, outputTokens: event.usage?.output_tokens ?? null })),
  subtype: result?.subtype ?? null,
  isError: result?.is_error ?? null,
  durationMs: result?.duration_ms ?? null,
  turns: result?.num_turns ?? null,
  costUsd: result?.total_cost_usd ?? null,
  usage: result?.usage ?? null,
  modelUsage: result?.modelUsage ?? null,
  model: init?.model ?? null,
  claudeCodeVersion: init?.claude_code_version ?? null,
  toolUses: toolUses.length,
  events: events.length,
};

git("add", "-A");
const patch = git("diff", "--cached", "--binary", baseTree);
const stat = git("diff", "--cached", "--stat", baseTree);
const notes = readText(notesPath);
const finalText = typeof result?.result === "string" ? result.result : "";

const plain = {
  "fix.patch": patch,
  "fix-stat.txt": stat,
  "notes.md": notes,
  "final-message.md": finalText,
  "commands.txt": commands,
  "summary.json": `${JSON.stringify(summary, null, 2)}\n`,
};

const forms = [token, Buffer.from(token).toString("base64"), Buffer.from(token).toString("hex"), [...token].reverse().join(""), encodeURIComponent(token)];
const pieces = [];
for (let start = 0; start + 16 <= token.length; start += 8) pieces.push(token.slice(start, start + 16));
const leaked = text => forms.some(form => text.includes(form)) || pieces.some(piece => text.includes(piece));

rmSync(outDir, { recursive: true, force: true });
if ([...Object.values(plain), transcript].some(leaked)) {
  console.error("the model token appears in the collected output; nothing is published");
  process.exit(1);
}

const iv = randomBytes(12);
const cipher = createCipheriv("aes-256-gcm", key, iv);
const body = Buffer.concat([cipher.update(gzipSync(JSON.stringify({ version: 1, files: { "transcript.jsonl": transcript } }))), cipher.final()]);

mkdirSync(outDir, { recursive: true });
for (const [name, text] of Object.entries(plain)) writeFileSync(path.join(outDir, name), text);
writeFileSync(path.join(outDir, "transcript.sealed"), Buffer.concat([iv, cipher.getAuthTag(), body]));
console.log(JSON.stringify({ ...summary, usage: undefined, modelUsage: undefined, patchBytes: patch.length, notesBytes: notes.length }));
