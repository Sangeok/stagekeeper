#!/usr/bin/env node
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { REPORT_AGENTS } from "../lib/plans/entitlement.mjs";

const INPUT_LIMIT = 4 * 1024 * 1024;
const GIT_WRITES = ["commit", "add"];
const GIT_VALUE_OPTIONS = ["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--config-env"];
const PREFIXES = ["if", "then", "else", "elif", "do", "while", "until", "!", "command", "exec", "time", "nohup", "env", "xargs"];
const RUNNERS = new Map([["bash", "bash"], ["sh", "bash"], ["pwsh", "powershell"], ["powershell", "powershell"]]);
const POLICY_REFUSAL = "Stagekeeper: this session's commit policy is no. Leave the changes uncommitted and report them; the owner commits.";
const reportRefusal = agent => `Stagekeeper: ${agent} does not commit. Leave the file uncommitted and send agent_next outcome handoff with its path as note; the main loop commits it.`;
const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
const nonempty = value => typeof value === "string" && value.length > 0;
const program = word => path.win32.basename(word).toLowerCase().replace(/\.exe$/, "");

function commands(script, shell) {
  const escape = shell === "powershell" ? "`" : "\\", list = [];
  let words = [], word = "", quoted = false, quote = null;
  const endWord = () => { if (word || quoted) words.push(word); word = ""; quoted = false; };
  const endCommand = () => { endWord(); if (words.length) list.push(words); words = []; };
  for (let i = 0; i < script.length; i++) {
    const c = script[i], next = script[i + 1];
    if (quote) {
      if (c === quote && shell === "powershell" && next === quote) { word += c; i++; }
      else if (c === quote) quote = null;
      else if (c === escape && quote === '"' && next !== undefined && (shell === "powershell" || "$`\"\\\n".includes(next))) { word += next; i++; }
      else word += c;
    } else if (c === escape && next !== undefined) {
      i++;
      if (next === "\r" && script[i + 1] === "\n") i++;
      else if (next !== "\n") word += next;
    } else if (c === "'" || c === '"') { quote = c; quoted = true; }
    else if (c === "#" && !word && !quoted) { while (i + 1 < script.length && script[i + 1] !== "\n" && script[i + 1] !== "\r") i++; }
    else if (c === "$" && next === "(") { endCommand(); i++; }
    else if (c === " " || c === "\t") endWord();
    else if ("\r\n;|&)".includes(c) || (c === "`" && shell === "bash") || ("({}".includes(c) && !word && !quoted)) endCommand();
    else word += c;
  }
  endCommand();
  return list;
}

function gitSubcommand(args) {
  for (let i = 0; i < args.length; i++) {
    if (GIT_VALUE_OPTIONS.includes(args[i])) i++;
    else if (!args[i].startsWith("-")) return args[i].replace(/[)}]+$/, "");
  }
  return null;
}

function nestedScript(args, shell) {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (shell === "powershell") {
      if (/^-c(o(m(m(a(n(d)?)?)?)?)?)?$/i.test(arg)) return args.slice(i + 1).join(" ");
      if (/^-f(i(l(e)?)?)?$/i.test(arg)) return null;
    } else if (/^-[A-Za-z]*c[A-Za-z]*$/.test(arg)) return args[i + 1] ?? null;
    else if (/^[-+][oO]$/.test(arg)) i++;
    else if (!arg.startsWith("-")) return null;
  }
  return null;
}

function writesGit(script, shell, nested = false) {
  return commands(script, shell).some(words => {
    let i = 0, options = false;
    while (i < words.length) {
      if (PREFIXES.includes(words[i])) { options = words[i] === "env" || words[i] === "xargs"; i++; }
      else if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i]) || options && words[i].startsWith("-")) i++;
      else break;
    }
    if (i === words.length) return false;
    const name = program(words[i]), args = words.slice(i + 1);
    if (name === "git") return GIT_WRITES.includes(gitSubcommand(args));
    const runner = RUNNERS.get(name), script = runner && !nested ? nestedScript(args, runner) : null;
    return script !== null && writesGit(script, runner, true);
  });
}

function checkout(start) {
  for (let directory = path.resolve(start); ; directory = path.dirname(directory)) {
    const marker = path.join(directory, ".git");
    if (existsSync(marker)) return { root: directory, common: commonDirectory(directory, marker) };
    if (path.dirname(directory) === directory) return null;
  }
}

function commonDirectory(root, marker) {
  if (statSync(marker).isDirectory()) return marker;
  const gitdir = /^gitdir: *(.+?)\s*$/m.exec(readFileSync(marker, "utf8"))?.[1];
  if (!gitdir) return null;
  const directory = path.resolve(root, gitdir), common = path.join(directory, "commondir");
  return existsSync(common) ? path.resolve(directory, readFileSync(common, "utf8").trim()) : directory;
}

function workspaceAgents(root) {
  const file = path.join(root, "harness.json");
  if (!existsSync(file)) return null;
  const config = JSON.parse(readFileSync(file, "utf8"));
  return isObject(config) && Array.isArray(config.workspaces) ? config.workspaces.map(workspace => isObject(workspace) ? workspace.agent : null) : null;
}

function sessionCommit(common) {
  const file = common === null ? null : path.join(common, "harness", "watch.json");
  if (file === null || !existsSync(file)) return null;
  const policy = JSON.parse(readFileSync(file, "utf8"));
  return isObject(policy) && policy.schemaVersion === 1 && typeof policy.commit === "boolean" ? policy.commit : null;
}

export function commitGuardReason(input, environment = process.env) {
  if (!isObject(input) || input.hook_event_name !== "PreToolUse" || !nonempty(input.agent_id) || !nonempty(input.agent_type)) return null;
  const shell = input.tool_name === "Bash" ? "bash" : input.tool_name === "PowerShell" ? "powershell" : null;
  const command = isObject(input.tool_input) ? input.tool_input.command : null;
  if (shell === null || typeof command !== "string" || !writesGit(command, shell)) return null;
  const start = [environment.CLAUDE_PROJECT_DIR, input.cwd].find(value => nonempty(value) && path.isAbsolute(value));
  const location = start === undefined ? null : checkout(start);
  const agents = location === null ? null : workspaceAgents(location.root);
  if (agents === null) return null;
  if (REPORT_AGENTS.includes(input.agent_type)) return reportRefusal(input.agent_type);
  return agents.includes(input.agent_type) && sessionCommit(location.common) === false ? POLICY_REFUSAL : null;
}

async function main() {
  let output = {};
  try {
    const chunks = []; let size = 0;
    for await (const chunk of process.stdin) {
      size += chunk.length;
      if (size <= INPUT_LIMIT) chunks.push(chunk);
    }
    const reason = size > INPUT_LIMIT ? null : commitGuardReason(JSON.parse(Buffer.concat(chunks).toString("utf8").replace(/^﻿/, "")));
    if (reason !== null) output = { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } };
  } catch {}
  process.stdout.write(JSON.stringify(output) + "\n");
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/harness-commit-guard.mjs")) void main();
