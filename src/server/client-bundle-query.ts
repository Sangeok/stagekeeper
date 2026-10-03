import { validateCodexBundle, runtimeEcho } from "@harness/core/client-runtime.mjs";
import { codexRunbookVersion, isRunbookVersion } from "@harness/core/runbook.mjs";
import type { Plan } from "./entitlement";
import type { ServerResult } from "./result";
import { splitTemplate } from "./agents/steps";
import { limitsFor } from "@harness/core/entitlement.mjs";

export type CodexBundle = { language: string; templates: Record<string, string>; version: string; runtime: ReturnType<typeof runtimeEcho> };
export type BundleReader = (language: string) => Promise<{ path: string; body: string }[]>;

export async function readCodexBundle(read: BundleReader, language: string, plan: Plan, fallback: boolean): Promise<ServerResult<CodexBundle>> {
  let selected = language;
  let rows = await read(selected);
  if (fallback && selected !== "en" && !rows.some(row => row.path === "CODEX.runbook.md")) {
    selected = "en";
    rows = await read(selected);
  }
  try {
    const templates = validateCodexBundle(rows, plan);
    for (const role of ["dev", ...limitsFor(plan).agents]) {
      const path = `agents/${role}.md`;
      if (splitTemplate(templates[path]).steps.length === 0) throw new Error(`Codex role has no steps: ${path}`);
    }
    return { ok: true, item: { language: selected, templates, version: codexRunbookVersion(templates["CODEX.runbook.md"]), runtime: runtimeEcho() } };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "Codex bundle unavailable" };
  }
}

export function checkCodexRunbook(bundle: CodexBundle, reported: unknown): string | null {
  if (!isRunbookVersion(reported)) return "Codex runbook version required: run $harness-init and send the source version on every pipeline_next call";
  return reported === bundle.version ? null : "Codex runbook is stale or belongs to another language: run $harness-init before continuing";
}
