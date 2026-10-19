export type { Plan } from "./access-query";
export type { ProjectAccess } from "./access-query";
export type { TransactionHost } from "./access-query";

export type WorkspaceInput = { id: string; path: string; agent: string; verify: string[]; knowledge: string | null; readOnly: string[] };
