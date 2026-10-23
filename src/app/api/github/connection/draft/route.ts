import { acknowledgeConnectionDraft, loadConnectionDraft } from "@/server/github/api.server";
import { browserBinding, jsonResult, requestIdentity, unavailable, connectionMutation } from "../../request";

export async function POST(request: Request): Promise<Response> {
  return connectionMutation(request, ({ identity, browser, body }) => acknowledgeConnectionDraft(identity.userId, browser, body), {});
}

export async function GET(request: Request): Promise<Response> {
  try {
    const identity = await requestIdentity(request);
    if (identity instanceof Response) return identity;
    const browser = await browserBinding();
    const flowId = new URL(request.url).searchParams.get("flowId") ?? "";
    const draft = browser ? await loadConnectionDraft(identity.userId, browser, flowId) : null;
    return jsonResult({ ok: true, value: { draft } });
  } catch { return unavailable(); }
}
