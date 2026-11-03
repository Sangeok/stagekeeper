import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { execFileSync } from "node:child_process";
import { z } from "zod";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { manifestHash } from "../../packages/core/templates/release-manifest.mjs";
import type { DeploymentAudit } from "../../src/server/templates/contracts";

const profileSchema = z.object({
  connectionString: z.string().min(1),
  hostname: z.string().min(1), port: z.number().int().positive().max(65535), database: z.string().min(1),
  schema: z.literal("public"), routing: z.record(z.string(), z.string()).default({}),
}).strict();
type Profile = z.infer<typeof profileSchema>;
export type TemplateTarget = { environment: string; profileId: string; profile: Profile; identityHash: string };

export function readTemplateTarget(filename: string, environment: string): TemplateTarget {
  if (!["development", "test", "staging", "production"].includes(environment) || !isAbsolute(filename)) throw new Error("An explicit approved environment and absolute profile file are required");
  const file = realpathSync(filename), stat = lstatSync(filename);
  const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
  const rel = relative(root, file);
  if (file !== resolve(filename) || !stat.isFile() || stat.nlink !== 1 || stat.size > 1024 * 1024 || (stat.mode & 0o077) !== 0
    || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(".." + sep))) throw new Error("Template profiles must be private regular files outside the repository");
  const profiles = z.record(z.string(), profileSchema).parse(JSON.parse(readFileSync(file, "utf8")));
  const profile = profiles[environment];
  if (!profile) throw new Error("The selected template environment is not approved");
  const url = new URL(profile.connectionString);
  const queryKeys = [...url.searchParams.keys()];
  if (!["postgres:", "postgresql:"].includes(url.protocol) || url.hash || url.hostname !== profile.hostname
    || Number(url.port || 5432) !== profile.port || decodeURIComponent(url.pathname.slice(1)) !== profile.database
    || (url.searchParams.get("schema") ?? "public") !== profile.schema || new Set(queryKeys).size !== queryKeys.length
    || ["options", "host", "hostaddr", "port", "database", "dbname", "service"].some(key => url.searchParams.has(key))) throw new Error("Template connection does not match its approved target");
  for (const [key, expected] of Object.entries(profile.routing)) if (url.searchParams.get(key) !== expected) throw new Error("Template provider routing mismatch");
  const identityHash = manifestHash({ environment, hostname: profile.hostname, port: profile.port, database: profile.database, schema: profile.schema, routing: profile.routing });
  return { environment, profileId: environment, profile, identityHash };
}

export async function withTemplateTarget<T>(target: TemplateTarget, work: (db: PrismaClient) => Promise<T>): Promise<T> {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: target.profile.connectionString }, { schema: target.profile.schema }) });
  try {
    const [actual] = await db.$queryRaw<{ database: string; schema: string }[]>`SELECT current_database() AS database, current_schema() AS schema`;
    if (actual.database !== target.profile.database || actual.schema !== target.profile.schema) throw new Error("Connected template target differs from the approved database/schema");
    return await work(db);
  } finally { await db.$disconnect(); }
}

export function templateCommandArguments(args: string[], names: readonly string[]): Record<string, string> {
  if (args.length % 2 !== 0) throw new Error("Template commands require explicit option/value pairs");
  const options: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!names.includes(args[i]) || Object.hasOwn(options, args[i]) || !args[i + 1] || args[i + 1].startsWith("--")) throw new Error("Unknown, repeated or missing template command argument");
    options[args[i]] = args[i + 1];
  }
  return options;
}

export const TEMPLATE_TARGET_OPTIONS = ["--profile-file", "--environment", "--request-id", "--actor", "--code-sha", "--workflow-run"] as const;

export function templateCommandAudit(target: TemplateTarget, options: Record<string, string>): DeploymentAudit {
  const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  if (options["--code-sha"] !== head) throw new Error("Template command code SHA does not match the checkout");
  if (target.environment === "production") throw new Error("Production template operations require the approved deployment workflow and cutover gate");
  return { actor: options["--actor"], environment: target.environment, targetProfileId: target.profileId, targetIdentityHash: target.identityHash,
    codeSha: head, workflowRun: options["--workflow-run"] };
}
