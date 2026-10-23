import { deliverable } from "@harness/core/templates/deliver.mjs";
import { parseClient, type Client } from "@harness/core/execution/client-runtime.mjs";
import { readCodexBundle } from "@/server/templates/api";
import type { Plan, ProjectAccess } from "@/server/projects/contracts";
import { resolveRestScope, type RestTokenDeps } from "./scope";
import type { RequestRateFailure } from "@/server/result";
import type { RestRateFailure } from "./response";

export type TemplateResult =
  | { ok: true; templates: Record<string, string>; entitlement: { plan: Plan; agents: string[] }; runtime?: { client: string; protocol: string } }
  | { ok: false; status: 400 | 401 | 403 | 404; reason: string; code?: never } | RestRateFailure;

export type TemplateDeps = RestTokenDeps & {
  requestLimit(projectId: string): Promise<RequestRateFailure | null>;
  projectAccess(projectId: string): Promise<ProjectAccess>;
  findTemplatesByLanguage(language: string): Promise<{ path: string; body: string }[]>;
};

type TemplatesFor = (
  authorizationHeader: string | null,
  language: string,
  project?: string | null,
  client?: Client | string | null,
) => Promise<TemplateResult>;

export function makeTemplatesFor(deps: TemplateDeps): TemplatesFor {
  return async function templatesFor(authorizationHeader, language, project = null, requestedClient = "claude") {
    let client: Client;
    try { client = parseClient(requestedClient); }
    catch { return { ok: false, status: 400, reason: "client must be claude or codex" }; }
    const scope = await resolveRestScope(deps, authorizationHeader, project);
    if (!scope.ok) return scope;

    const access = await deps.projectAccess(scope.projectId);
    if (!access.available) {
      return { ok: false, status: 403, reason: access.reason };
    }

    const limited = await deps.requestLimit(scope.projectId);
    if (limited) return { ...limited, status: 429 };
    if (client === "codex") {
      const bundle = await readCodexBundle(deps.findTemplatesByLanguage, language, access.plan, false);
      if (!bundle.ok) return { ok: false, status: 404, reason: bundle.reason };
      return { ok: true, ...deliverable(Object.entries(bundle.item.templates).map(([path, body]) => ({ path, body })), access.plan, client) };
    }
    const templateRows = await deps.findTemplatesByLanguage(language);
    if (templateRows.length === 0) {
      return { ok: false, status: 404, reason: `no templates for language: ${language}` };
    }

    return { ok: true, ...deliverable(templateRows, access.plan, client) };
  };
}
