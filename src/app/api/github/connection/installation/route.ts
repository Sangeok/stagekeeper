import { completeRepositoryInstallation } from "@/server/github/api.server";
import { siteUrl } from "@/server/public-url";
import { PRIVATE_HEADERS, browserBinding, requestIdentity, returnToForm } from "../../request";

export async function GET(request: Request): Promise<Response> {
  try {
    const identity = await requestIdentity(request);
    if (identity instanceof Response) return identity.status === 401 ? new Response(null, { status: 303, headers: { ...PRIVATE_HEADERS, Location: new URL("/login", siteUrl()).toString() } }) : returnToForm();
    const browser = await browserBinding();
    if (!browser || request.url.length > 8192) return returnToForm();
    const query = new URL(request.url).searchParams;
    const result = await completeRepositoryInstallation({ userId: identity.userId, browser, state: query.get("state") ?? "", installationId: query.get("installation_id") ?? "" });
    return result.ok ? new Response(null, { status: 303, headers: { ...PRIVATE_HEADERS, Location: result.value.redirectTo } }) : returnToForm();
  } catch { console.error("github repository callback", { outcome: "unavailable" }); return returnToForm(); }
}
