import "server-only";
import { cookies } from "next/headers";
import { listPublicRepos, loadRepositoryConnection } from "@/server/github/api.server";
import type { PickerInitialState, PublicRepository } from "../model/github-connection-state";

export async function loadRepositoryPickerState(userId: string, login: string): Promise<{ picker: PickerInitialState; repos: PublicRepository[]; repoLoadFailed: boolean }> {
  const jar = await cookies();
  const browser = jar.get("__Host-stagekeeper-github")?.value ?? jar.get("stagekeeper-github")?.value ?? null;
  const [repos, connection] = await Promise.all([listPublicRepos(login), loadRepositoryConnection(userId, browser)]);
  return { picker: { userKey: userId, connection }, repos: repos.ok ? repos.repos : [], repoLoadFailed: !repos.ok };
}
