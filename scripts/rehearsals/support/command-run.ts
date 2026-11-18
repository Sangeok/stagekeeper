import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { appendFileSync, closeSync, openSync, readFileSync } from "node:fs";
import path from "node:path";

export type Command = { code: number; stdout: string; stderr: string };

export type Step = { step: string; result: "pass" | "fail" | "skip" };

export class Run {
  readonly steps: Step[] = [];
  readonly outputs: string[] = [];
  failure: string | undefined;

  constructor(readonly log: string, readonly signal?: AbortSignal) {}

  async step<T>(name: string, action: () => Promise<T> | T): Promise<T> {
    try {
      this.signal?.throwIfAborted();
      const value = await action();
      this.steps.push({ step: name, result: "pass" });
      return value;
    } catch (error) {
      this.steps.push({ step: name, result: "fail" });
      this.failure = name;
      throw error;
    }
  }

  command(file: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, timeout = 120_000, outputFile?: string): Command {
    const output = outputFile === undefined ? undefined : openSync(outputFile, "w");
    let result: SpawnSyncReturns<string>;
    try {
      result = spawnSync(file, args, { cwd, env, encoding: "utf8", timeout, windowsHide: true, maxBuffer: 16 * 1024 * 1024, stdio: output === undefined ? "pipe" : ["ignore", output, output] });
    } finally {
      if (output !== undefined) closeSync(output);
    }
    const outcome = {
      code: result.error ? -1 : result.status ?? -1,
      stdout: outputFile === undefined ? result.stdout ?? "" : readFileSync(outputFile, "utf8"),
      stderr: result.stderr ?? "",
    };
    this.outputs.push(outcome.stdout, outcome.stderr);
    appendFileSync(this.log, `$ ${path.basename(file)} ${args.join(" ")}\nexit ${outcome.code}\n${outcome.stdout}\n${outcome.stderr}\n`);
    return outcome;
  }

  succeed(file: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, label: string, timeout?: number): Command {
    const outcome = this.command(file, args, cwd, env, timeout);
    if (outcome.code !== 0) throw new Error(`${label} exited ${outcome.code}${markerLine(outcome)}`);
    return outcome;
  }
}

function markerLine(outcome: Command): string {
  const line = `${outcome.stdout}\n${outcome.stderr}`.split(/\r?\n/).map(text => text.trim()).filter(text => /^(?:plan|write|skip\(modified\)|skip\(plan\)|refuse|server|stop|note|Initialization error|Config error|Server URL required|Registration|Templates unavailable|Cannot reach|HARNESS_TOKEN required)\b/.test(text)).at(-1);
  return line ? `: ${line}` : "";
}
