import { runnerRequest } from "@/server/rest/api.server";
import { runnerResponse } from "@/server/rest/api";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  return runnerResponse(await runnerRequest(request.headers.get("authorization"), body));
}
