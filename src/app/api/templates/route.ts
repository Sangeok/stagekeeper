import { templatesFor } from "@/server/rest/api.server";
import { restFailureResponse } from "@/server/rest/api";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const language = params.get("lang") ?? "en";
  const authorizationHeader = request.headers.get("authorization");
  const result = await templatesFor(authorizationHeader, language, params.get("project"), params.get("client"));
  return result.ok
    ? Response.json({ templates: result.templates, entitlement: result.entitlement, ...(result.runtime ? { runtime: result.runtime } : {}) })
    : restFailureResponse(result);
}
