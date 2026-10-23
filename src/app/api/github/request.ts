import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { siteUrl } from "@/server/public-url";
import { limitAccountRequest } from "@/server/usage/api.server";
import type { Result } from "@/server/github/contracts";

export const PRIVATE_HEADERS = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };

export function jsonResult<T>(result: Result<T>): Response {
  if (!result.ok) return Response.json({ ok: false, code: result.code, message: result.message }, { status: result.status,
    headers: { ...PRIVATE_HEADERS, ...(result.retryAfter ? { "Retry-After": String(result.retryAfter) } : {}) } });
  return Response.json({ ok: true, value: result.value }, { headers: PRIVATE_HEADERS });
}

export async function requestIdentity(request: Request, mutation = false): Promise<{ userId: string; githubId: string } | Response> {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ ok: false, code: "UNAUTHENTICATED", message: "Sign in again to continue." }, { status: 401, headers: PRIVATE_HEADERS });
  if (request.headers.has("x-stagekeeper-user") && request.headers.get("x-stagekeeper-user") !== session.user.id) {
    return Response.json({ ok: false, code: "UNAUTHENTICATED", message: "Your account changed. Sign in again to continue." }, { status: 401, headers: PRIVATE_HEADERS });
  }
  if (mutation && (request.headers.get("origin") !== new URL(siteUrl()).origin || request.headers.get("x-stagekeeper-request") !== "repository-picker")) {
    return Response.json({ ok: false, code: "INVALID_INPUT", message: "Check the repository connection request." }, { status: 400, headers: PRIVATE_HEADERS });
  }
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { githubId: true } });
  if (!user) return Response.json({ ok: false, code: "UNAUTHENTICATED", message: "Sign in again to continue." }, { status: 401, headers: PRIVATE_HEADERS });
  const budget = await limitAccountRequest(session.user.id);
  if (budget) return Response.json({ ok: false, code: "RATE_LIMITED", message: "Wait before trying again." }, { status: 429, headers: { ...PRIVATE_HEADERS, "Retry-After": String(budget.retryAfterSec) } });
  return { userId: session.user.id, githubId: String(user.githubId) };
}

export async function browserBinding(create = false): Promise<string | null> {
  const secure = new URL(siteUrl()).protocol === "https:";
  const name = secure ? "__Host-stagekeeper-github" : "stagekeeper-github";
  const jar = await cookies();
  const value = jar.get(name)?.value;
  if (value && /^[A-Za-z0-9_-]{43}$/.test(value)) {
    if (create) jar.set(name, value, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 1200 });
    return value;
  }
  if (!create || process.env.NODE_ENV === "production" && !secure) return null;
  const binding = randomBytes(32).toString("base64url");
  jar.set(name, binding, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 1200 });
  return binding;
}

export async function limitedBody(request: Request, limit = 16384): Promise<string | Response> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > limit) {
        await reader.cancel();
        return Response.json({ ok: false, code: "INVALID_INPUT", message: "The connection request is too large." }, { status: 413, headers: PRIVATE_HEADERS });
      }
      chunks.push(part.value);
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally { reader.releaseLock(); }
}

export async function jsonBody(request: Request): Promise<{ body: unknown } | Response> {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return Response.json({ ok: false, code: "INVALID_INPUT", message: "JSON request required." }, { status: 400, headers: PRIVATE_HEADERS });
  const raw = await limitedBody(request);
  if (raw instanceof Response) return raw;
  try { return { body: JSON.parse(raw) as unknown }; }
  catch { return Response.json({ ok: false, code: "INVALID_INPUT", message: "Check the connection request." }, { status: 400, headers: PRIVATE_HEADERS }); }
}

export function unavailable(): Response {
  console.error("github repository connection", { outcome: "unavailable" });
  return Response.json({ ok: false, code: "UNAVAILABLE", message: "The repository list is unavailable. You can still paste a repository URL." }, { status: 503, headers: PRIVATE_HEADERS });
}

export function returnToForm(): Response {
  return new Response(null, { status: 303, headers: { ...PRIVATE_HEADERS, Location: new URL("/p/new", siteUrl()).toString() } });
}

export async function connectionMutation(request: Request, action: (input: { identity: { userId: string; githubId: string }; browser: string; body: unknown }) => Promise<Result<unknown>>, options: { createBinding?: boolean; requireBinding?: boolean } = {}): Promise<Response> {
  try {
    const identity = await requestIdentity(request, true);
    if (identity instanceof Response) return identity;
    const parsed = await jsonBody(request);
    if (parsed instanceof Response) return parsed;
    const browser = await browserBinding(options.createBinding);
    if (!browser && options.requireBinding !== false) return Response.json({ ok: false, code: "INVALID_STATE", message: "Start a new connection attempt." }, { status: 400, headers: PRIVATE_HEADERS });
    return jsonResult(await action({ identity, browser: browser ?? "", body: parsed.body }));
  } catch { return unavailable(); }
}
