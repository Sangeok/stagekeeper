import { canonicalJson, manifestHash } from "./manifest-hash.mjs";

export const TEMPLATE_PROTOCOL = "template-release-v1";

const INSTALLATION_GUIDE = [
  "## Template installation contract",
  "On every pipeline_next and agent_next call, include the verified installation below, even where an older example omits it.",
  "installation = {{installation}}",
  "On every agent_next initial, resume and outcome call, repeat project, agent and the item key from the briefing. An entry, execution or receipt never replaces key. Only keyless project roles omit key.",
  "For agent_next preserve the exact entry or execution object from the fresh parent briefing and every returned receipt. Never invent or interchange parent run IDs and AgentRun receipt IDs.",
  "If pipeline_next has moved past your bound entry, stop this role and return to the parent for fresh advice; do not keep retrying the old entry.",
  "An allowed independent role without a parent uses execution: {kind: standalone}. Item roles and work assignment require their supplied pipeline binding.",
  "The server's templateRelease identifies the pinned instructions. It may differ from the installed release when the public surface is compatible; keep the verified local installation tuple.",
  "Before dispatch, recheck the installation with the installed template guard or session helper. On a pending, modified, incompatible or missing installation, stop and request init for the required release; do not adopt files automatically.",
].join("\n");

export const TEMPLATE_CONTRACT = Object.freeze({ schemaVersion: 1, parser: 1, runtime: "harness-runtime-v1", aliases: 1,
  minimumClaudeVersion: "2.1.295", installationGuide: INSTALLATION_GUIDE, clients: Object.freeze(["claude", "codex"]) });

export function installationGuide(installation) {
  return INSTALLATION_GUIDE.replace("{{installation}}", canonicalJson(installation));
}

export function readTemplateContract(manifest, expectedHash) {
  const contract = manifest?.contract;
  const fields = ["schemaVersion", "parser", "runtime", "aliases", "minimumClaudeVersion", "installationGuide", "clients"];
  if (!contract || typeof contract !== "object" || Array.isArray(contract) || Object.keys(contract).length !== fields.length
    || fields.some(field => !Object.hasOwn(contract, field)) || contract.schemaVersion !== 1 || contract.parser !== 1
    || contract.runtime !== "harness-runtime-v1" || contract.aliases !== 1 || !/^\d+\.\d+\.\d+$/.test(contract.minimumClaudeVersion ?? "")
    || JSON.stringify(contract.clients) !== '["claude","codex"]' || typeof contract.installationGuide !== "string"
    || contract.installationGuide.split("{{installation}}").length !== 2 || /^## step:/m.test(contract.installationGuide)
    || contract.installationGuide.includes("<!-- harness-runtime:") || manifestHash(contract) !== expectedHash) throw new Error("Unsupported template interpretation contract");
  return contract;
}

export function compatibleInstallation(installed, required) {
  return !!installed && installed.protocol === TEMPLATE_PROTOCOL && installed.language === required.language
    && installed.clientSurfaceHash === required.clientSurfaceHash;
}
