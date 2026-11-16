import { timingSafeEqual } from "node:crypto";
import { maintainGitHubConnections } from "@/server/github/api.server";

export const runtime = "nodejs";
export const maxDuration = 300;

const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32) {
    return Response.json({ error: "Maintenance is not configured." }, { status: 503, headers });
  }
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return Response.json({ error: "Unauthorized." }, { status: 401, headers });
  }
  try {
    const result = await maintainGitHubConnections(false);
    if (!result.cleanupComplete) console.warn("GitHub repository cleanup has remaining work.", result);
    return Response.json(result, { headers });
  } catch {
    return Response.json({ error: "GitHub repository maintenance failed." }, { status: 500, headers });
  }
}
