import { templatesFor } from "@/server/rest/api.server";
import { restFailureResponse } from "@/server/rest/api";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const language = params.get("lang") ?? "en";
  const authorizationHeader = request.headers.get("authorization");
  const result = await templatesFor(authorizationHeader, language, params.get("project"), params.get("client"), { protocol: params.get("templateProtocol"), releaseId: params.get("release") });
  const response = result.ok
    ? Response.json({ templates: result.templates, entitlement: result.entitlement, ...(result.runtime ? { runtime: result.runtime } : {}), ...(result.templateRelease ? { templateRelease: result.templateRelease, templateContract: result.templateContract } : {}) })
    : restFailureResponse(result);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
