import { projectIdentityFor } from "@/server/rest/api.server";
import { restFailureResponse } from "@/server/rest/api";

export async function GET(request: Request) {
  const project = new URL(request.url).searchParams.get("project");
  const result = await projectIdentityFor(request.headers.get("authorization"), project);
  return result.ok
    ? Response.json({ project: result.project })
    : restFailureResponse(result);
}
