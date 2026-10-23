import { handleGitHubWebhook } from "@/server/github/api.server";
import { PRIVATE_HEADERS, jsonResult, limitedBody, unavailable } from "../request";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await limitedBody(request, 262144);
    if (body instanceof Response) return body;
    const result = await handleGitHubWebhook({ body, signature: request.headers.get("x-hub-signature-256"), event: request.headers.get("x-github-event") ?? "", deliveryId: request.headers.get("x-github-delivery") ?? "" });
    return result.ok ? new Response(null, { status: 204, headers: PRIVATE_HEADERS }) : jsonResult(result);
  } catch { return unavailable(); }
}
