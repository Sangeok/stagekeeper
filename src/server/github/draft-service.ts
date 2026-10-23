import { z } from "zod";
import type { Result, Store } from "./contracts";
import { failure } from "./failure";

export async function acknowledgeDraft(store: Store, input: { userId: string; browserHash: string; body: unknown }): Promise<Result<null>> {
  const parsed = z.object({ id: z.uuid(), generation: z.number().int().nonnegative() }).safeParse(input.body);
  if (!parsed.success) return failure("INVALID_INPUT");
  await store.acknowledge({ userId: input.userId, browserHash: input.browserHash, ...parsed.data });
  return { ok: true, value: null };
}

export async function cancelConnectionAttempt(store: Store, input: { userId: string; browserHash: string; body: unknown }): Promise<Result<null>> {
  const parsed = z.object({ id: z.uuid() }).safeParse(input.body);
  if (!parsed.success) return failure("INVALID_INPUT");
  await store.cancel({ userId: input.userId, browserHash: input.browserHash, id: parsed.data.id });
  return { ok: true, value: null };
}
