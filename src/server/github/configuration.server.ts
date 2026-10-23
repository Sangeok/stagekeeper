import "server-only";
import { z } from "zod";
import type { AppConfiguration } from "./contracts";

const schema = z.object({
  clientId: z.string().min(1), clientSecret: z.string().min(1), appId: z.string().regex(/^\d+$/),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/), origin: z.url(),
});

export function appConfiguration(env: Readonly<Record<string, string | undefined>> = process.env): AppConfiguration | null {
  const parsed = schema.safeParse({ clientId: env.GITHUB_REPOSITORY_APP_CLIENT_ID, clientSecret: env.GITHUB_REPOSITORY_APP_CLIENT_SECRET,
    appId: env.GITHUB_REPOSITORY_APP_ID, slug: env.GITHUB_REPOSITORY_APP_SLUG, origin: env.HARNESS_PUBLIC_URL ?? "http://localhost:3000" });
  if (!parsed.success) return null;
  const url = new URL(parsed.data.origin);
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
  if (url.protocol !== "https:" && !(env.NODE_ENV !== "production" && url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) return null;
  return { ...parsed.data, origin: url.origin };
}

export function pickerEnabled(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return env.GITHUB_REPOSITORY_PICKER_ENABLED === "true" && env.GITHUB_REPOSITORY_OPERATIONS_READY === "true";
}

export function webhookConfiguration(env: Readonly<Record<string, string | undefined>> = process.env): { secret: string; appId: string } | null {
  const secret = env.GITHUB_REPOSITORY_WEBHOOK_SECRET;
  const appId = env.GITHUB_REPOSITORY_APP_ID;
  return secret && secret.length >= 32 && appId && /^\d+$/.test(appId) ? { secret, appId } : null;
}
