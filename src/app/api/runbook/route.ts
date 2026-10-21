import { recordRunbook } from "@/server/rest/api.server";
import { restFailureResponse } from "@/server/rest/api";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const result = await recordRunbook(request.headers.get("authorization"), body);
  return result.ok ? Response.json({ ok: true }) : restFailureResponse(result);
}
