import path from "node:path";

const COMMIT = /^[0-9a-f]{40}$/;

export const USAGE = [
  "usage: node --import tsx scripts/rehearsals/rehearse-client-init-smoke.ts",
  "  --client claude --scenario <new-user|update> --templates <private templates checkout>",
  "  --plugin-source <github-branch|export> --plugin-commit <40-hex commit> [--plugin-branch <branch>]",
  "  [--previous-ref <40-hex commit, update only>] [--snapshot <path outside this repository>] [--allow-machine-changes]",
  "environment: TEST_DATABASE_URL (stagekeeper_test_*), CI=true unless --allow-machine-changes",
].join("\n");

export type Options = {
  client: "claude" | "codex";
  scenario: "new-user" | "update";
  templates: string;
  templateCommit?: string;
  pluginSource: "github-branch" | "export" | "bundle";
  pluginCommit: string;
  pluginBranch?: string;
  previousRef?: string;
  snapshot?: string;
  allowMachineChanges: boolean;
  help: boolean;
};

const VALUED = ["--client", "--scenario", "--templates", "--plugin-source", "--plugin-commit", "--plugin-branch", "--previous-ref", "--snapshot", "--template-commit"];

const FLAGS = ["--allow-machine-changes", "--help"];

export function parseArguments(args: string[]): Options {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let index = 0; index < args.length; index++) {
    const name = args[index];
    if (FLAGS.includes(name)) {
      if (flags.has(name)) throw new Error(`duplicate option ${name}`);
      flags.add(name);
      continue;
    }
    if (!VALUED.includes(name)) throw new Error(`unknown option ${name}`);
    if (values.has(name)) throw new Error(`duplicate option ${name}`);
    const value = args[++index];
    if (!value || value.startsWith("--")) throw new Error(`missing value for ${name}`);
    values.set(name, value);
  }
  const help = flags.has("--help");
  if (help) return { client: "claude", scenario: "new-user", templates: "", pluginSource: "github-branch", pluginCommit: "", allowMachineChanges: false, help };
  const client = values.get("--client");
  const scenario = values.get("--scenario");
  const pluginSource = values.get("--plugin-source");
  const templates = values.get("--templates");
  const pluginCommit = values.get("--plugin-commit");
  const previousRef = values.get("--previous-ref");
  if (client !== "claude" && client !== "codex") throw new Error("--client must be claude or codex");
  if (scenario !== "new-user" && scenario !== "update") throw new Error("--scenario must be new-user or update");
  if (pluginSource !== "github-branch" && pluginSource !== "export" && pluginSource !== "bundle") throw new Error("--plugin-source must be github-branch, export or bundle");
  if (!templates || !path.isAbsolute(templates)) throw new Error("--templates must be an absolute path");
  if (!pluginCommit || !COMMIT.test(pluginCommit)) throw new Error("--plugin-commit must be a 40-hex commit");
  if (pluginSource === "github-branch" && !values.get("--plugin-branch")) throw new Error("--plugin-source github-branch needs --plugin-branch");
  if (scenario === "update" && (!previousRef || !COMMIT.test(previousRef))) throw new Error("--scenario update needs --previous-ref with a 40-hex commit");
  if (scenario === "new-user" && previousRef) throw new Error("--previous-ref applies only to --scenario update");
  const templateCommit = values.get("--template-commit");
  if (templateCommit && !COMMIT.test(templateCommit)) throw new Error("--template-commit must be a full commit SHA");
  const snapshot = values.get("--snapshot");
  if (snapshot && !path.isAbsolute(snapshot)) throw new Error("--snapshot must be an absolute path");
  if (client !== "claude" || pluginSource === "bundle") throw new Error(`${client} from ${pluginSource} is not implemented yet`);
  return { client, scenario, templates, templateCommit, pluginSource, pluginCommit, pluginBranch: values.get("--plugin-branch"), previousRef, snapshot, allowMachineChanges: flags.has("--allow-machine-changes"), help };
}
