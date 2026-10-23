import { listAuthorizedRepositories } from "@/server/github/api.server";
import { jsonResult, requestIdentity, unavailable } from "../request";

export async function GET(request: Request): Promise<Response> {
  try {
    const identity = await requestIdentity(request);
    if (identity instanceof Response) return identity;
    return jsonResult(await listAuthorizedRepositories(identity.userId, new URL(request.url).searchParams.get("cursor")));
  } catch { return unavailable(); }
}
