import { z } from "zod";

const envelope = z.discriminatedUnion("ok", [z.object({ ok: z.literal(true), value: z.unknown() }),
  z.object({ ok: z.literal(false), code: z.enum(["UNAUTHENTICATED", "INVALID_INPUT", "INVALID_STATE", "STALE_CONNECTION", "ACCOUNT_MISMATCH", "REAUTH_REQUIRED", "PERMISSION_REQUIRED", "RATE_LIMITED", "UNAVAILABLE"]), message: z.string() })]);
type ApiResult = { ok: true; value: unknown } | { ok: false; code: string; message: string; retryAfter: number };

export async function repositoryPickerRequest(userKey: string, path: string, input: { body?: unknown; signal?: AbortSignal } = {}): Promise<ApiResult> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, 15000);
  input.signal?.addEventListener("abort", abort, { once: true });
  if (input.signal?.aborted) abort();
  try {
    const response = await fetch(`/api/github/${path}`, { method: input.body === undefined ? "GET" : "POST", cache: "no-store", credentials: "same-origin",
    signal: controller.signal, headers: { "x-stagekeeper-request": "repository-picker", "x-stagekeeper-user": userKey,
      ...(input.body === undefined ? {} : { "Content-Type": "application/json" }) }, ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }) });
    const parsed = envelope.safeParse(await response.json());
    if (!parsed.success) throw new Error("Invalid repository picker response");
    const retryAfter = Math.max(0, Math.min(3600, Number(response.headers.get("retry-after")) || 0));
    return parsed.data.ok ? parsed.data : { ...parsed.data, retryAfter };
  } finally { clearTimeout(timer); input.signal?.removeEventListener("abort", abort); }
}

export function navigateToGitHub(value: string): void {
  const url = new URL(value);
  if (url.origin !== "https://github.com" || url.username || url.password || url.hash
    || !(url.pathname === "/login/oauth/authorize" || /^\/apps\/[a-z0-9-]+\/installations\/new$/.test(url.pathname))) throw new Error("Invalid repository authorization destination");
  window.location.assign(url.toString());
}
