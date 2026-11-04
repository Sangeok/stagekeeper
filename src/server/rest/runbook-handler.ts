import { isRunbookVersion, runbookVersion, codexRunbookVersion } from "@harness/core/templates/runbook.mjs";
import { compatibleInstallation, installationFor, releaseDeliverable } from "@harness/core/templates/release-manifest.mjs";
import { templateInstallationSchema } from "@/server/templates/api";
import type { TemplateDeliverySource } from "@/server/templates/contracts";
import type { ServerResult } from "@/server/result";
import { z } from "zod";
import { resolveRestScope, type RestTokenDeps } from "./scope";
import type { ProjectAccess } from "@/server/projects/contracts";
import type { RequestRateFailure } from "@/server/result";
import type { RestRateFailure } from "./response";

export type RunbookResult = { ok: true } | { ok: false; status: 400 | 401 | 403; reason: string; code?: never } | RestRateFailure;

export type RunbookDeps = RestTokenDeps & {
  requestLimit(projectId: string): Promise<RequestRateFailure | null>;
  projectAccess(projectId: string): Promise<ProjectAccess>;
  saveRunbookVersion(projectId: string, version: string): Promise<void>;
  templateMode(): Promise<"legacy" | "versioned">;
  readRelease(input: { releaseId?: string; language: string }): Promise<ServerResult<TemplateDeliverySource>>;
};

const installationReportSchema = z.object({ project: z.string().optional(), client: z.enum(["claude", "codex"]), version: z.string().refine(isRunbookVersion), installation: templateInstallationSchema }).strict();

const fieldOf = (body: unknown, key: "version" | "project"): string | null => {
  if (typeof body !== "object" || body === null) return null;
  const value = (body as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
};

const versionOf = (body: unknown): string | null => {
  const value = fieldOf(body, "version");
  return isRunbookVersion(value) ? value : null;
};

const projectOf = (body: unknown): string | null => {
  const value = fieldOf(body, "project");
  return value !== null && value.length > 0 ? value : null;
};

type RecordRunbook = (authorizationHeader: string | null, body: unknown) => Promise<RunbookResult>;

export function makeRecordRunbook(deps: RunbookDeps): RecordRunbook {
  return async function recordRunbook(authorizationHeader, body) {
    const scope = await resolveRestScope(deps, authorizationHeader, projectOf(body));
    if (!scope.ok) return scope;

    const access = await deps.projectAccess(scope.projectId);
    if (!access.available) return { ok: false, status: 403, reason: access.reason };

    const limited = await deps.requestLimit(scope.projectId);
    if (limited) return { ...limited, status: 429 };
    const version = versionOf(body);
    if (version === null) return { ok: false, status: 400, reason: "version must be 12 lowercase hex characters" };

    if (await deps.templateMode() === "versioned") {
      const parsed = installationReportSchema.safeParse(body);
      if (!parsed.success) return { ok: false, status: 400, reason: "Client, version and template installation metadata are required" };
      const { client, installation } = parsed.data;
      const bundle = await deps.readRelease({ releaseId: installation.releaseId, language: installation.language });
      if (!bundle.ok) return { ok: false, status: 400, reason: bundle.reason };
      const selected = bundle.item;
      const required = installationFor({ releaseId: selected.id, rows: selected.rows, language: selected.language, client, plan: access.plan, contractHash: selected.contractHash, contract: selected.contract });
      const runbook = releaseDeliverable(selected.rows, access.plan, client, selected.contract).templates[client === "claude" ? "CLAUDE.runbook.md" : "CODEX.runbook.md"];
      if (!runbook || !compatibleInstallation(installation, required)
        || (client === "claude" ? runbookVersion(runbook) : codexRunbookVersion(runbook)) !== version) return { ok: false, status: 400, reason: "Installed template metadata or runbook differs from the selected release" };
      return { ok: true };
    }
    if (typeof body === "object" && body !== null && "installation" in body) return { ok: false, status: 400, reason: "Template release protocol is not active" };

    await deps.saveRunbookVersion(scope.projectId, version);
    return { ok: true };
  };
}
