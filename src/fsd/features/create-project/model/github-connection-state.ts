import { z } from "zod";

export type PublicRepository = { source: "public"; repositoryId: string; owner: string; name: string; defaultBranch: string };
export const authorizedRepositorySchema = z.object({ source: z.literal("authorized"), repositoryId: z.string().regex(/^[1-9]\d*$/),
  installationId: z.string().regex(/^[1-9]\d*$/), repositoryPage: z.number().int().min(1).max(10000), owner: z.string().min(1), name: z.string().min(1), fullName: z.string(),
  defaultBranch: z.string().nullable(), visibility: z.enum(["public", "private"]), connectionRevision: z.number().int().nonnegative() });
export type AuthorizedRepository = z.infer<typeof authorizedRepositorySchema>;
export type ConnectionView = { available: boolean; status: "not-connected" | "connected" | "reauth-required"; revision: number | null; notice: string | null };
export type PickerInitialState = { userKey: string; connection: ConnectionView };
export type RepositoryConnectionOperation = "idle" | "opening" | "disconnecting";
export const OFF_PICKER: PickerInitialState = { userKey: "", connection: { available: false, status: "not-connected", revision: null, notice: null } };

export const savedDraftSchema = z.object({ selection: z.discriminatedUnion("source", [
  z.object({ source: z.literal("url"), url: z.string() }),
  z.object({ source: z.literal("direct"), owner: z.string(), repo: z.string() }),
  z.object({ source: z.literal("picker"), repository: z.object({ owner: z.string(), repo: z.string(), repositoryId: z.string() }).nullable() }),
  z.object({ source: z.literal("authorized"), repository: authorizedRepositorySchema }),
]), slug: z.string(), name: z.string(), branch: z.string(), slugTouched: z.boolean(), branchTouched: z.boolean(), manual: z.boolean(), editing: z.boolean(), urlDraft: z.string() });
export type SavedDraft = z.infer<typeof savedDraftSchema>;
export const restorableDraftSchema = z.object({ id: z.uuid(), flowId: z.uuid(), generation: z.number().int().nonnegative(), value: savedDraftSchema });
export const repositoryPageSchema = z.object({ repositories: z.array(authorizedRepositorySchema), nextCursor: z.string().nullable(),
  connectionRevision: z.number().int().nonnegative(), failedInstallations: z.array(z.string()), unsupportedCount: z.number().int().nonnegative(), status: z.enum(["ready", "empty", "partial"]) });
export type QueryState = { status: "idle" | "loading" | "ready" | "empty" | "partial" | "error"; repositories: AuthorizedRepository[]; nextCursor: string | null; unsupportedCount: number; message: string | null };
export const EMPTY_QUERY: QueryState = { status: "idle", repositories: [], nextCursor: null, unsupportedCount: 0, message: null };

export function combineRepositories(publicRows: PublicRepository[], authorizedRows: AuthorizedRepository[]): (PublicRepository | AuthorizedRepository)[] {
  const rows = new Map<string, PublicRepository | AuthorizedRepository>();
  for (const row of [...publicRows, ...authorizedRows]) if (!rows.has(row.repositoryId)) rows.set(row.repositoryId, row);
  return [...rows.values()];
}
