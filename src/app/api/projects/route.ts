import { registerProject } from "@/server/rest/api.server";
import { restFailureResponse } from "@/server/rest/api";
import { projectPath } from "@/fsd/shared/routes/project";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const result = await registerProject(request.headers.get("authorization"), body);
  if (!result.ok && result.status === 429) return restFailureResponse(result);
  return result.ok
    ? Response.json({ project: result.project }, { status: result.created ? 201 : 200 })
    : Response.json({ error: result.reason, ...(result.reconnectSlug === undefined ? {} : { reconnectPath: projectPath(result.reconnectSlug) }) }, { status: result.status });
}
