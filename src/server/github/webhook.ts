import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Result, Store } from "./contracts";
import { failure } from "./failure";

const id = z.union([z.string().regex(/^[1-9]\d*$/), z.number().int().positive().max(Number.MAX_SAFE_INTEGER)]).transform(String);
const authorization = z.object({ action: z.literal("revoked"), sender: z.object({ id }) });
const installation = z.object({ action: z.string(), installation: z.object({ id, app_id: id }) });

export function validWebhookSignature(body: string, signature: string | null, secret: string): boolean {
  if (!signature || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(body).digest();
  return timingSafeEqual(expected, Buffer.from(signature.slice(7), "hex"));
}

export async function processWebhook(store: Store, input: { body: string; event: string; deliveryId: string; appId: string; now: Date }): Promise<Result<null>> {
  if (!z.uuid().safeParse(input.deliveryId).success) return failure("INVALID_INPUT");
  let body: unknown;
  try { body = JSON.parse(input.body); } catch { return failure("INVALID_INPUT"); }
  const delivery = { deliveryId: input.deliveryId, now: input.now, expiresAt: new Date(input.now.getTime() + 86400000) };
  if (input.event === "github_app_authorization") {
    const parsed = authorization.safeParse(body);
    if (!parsed.success) return failure("INVALID_INPUT");
    await store.applyWebhook({ ...delivery, githubId: parsed.data.sender.id });
  } else if (input.event === "installation" || input.event === "installation_repositories") {
    const parsed = installation.safeParse(body);
    if (!parsed.success || parsed.data.installation.app_id !== input.appId) return failure("INVALID_INPUT");
    const invalidates = input.event === "installation_repositories" ? ["added", "removed"].includes(parsed.data.action)
      : ["deleted", "suspend", "unsuspend", "new_permissions_accepted"].includes(parsed.data.action);
    await store.applyWebhook({ ...delivery, ...(invalidates ? { installationId: parsed.data.installation.id } : {}) });
  } else {
    if (!body || typeof body !== "object" || Array.isArray(body)) return failure("INVALID_INPUT");
    await store.applyWebhook(delivery);
  }
  return { ok: true, value: null };
}
