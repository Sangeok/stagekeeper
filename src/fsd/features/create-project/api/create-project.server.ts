"use server";
import { newToken } from "@harness/core/token.mjs";
import { requireUser } from "@/server/auth/guard";
import { prisma } from "@/server/db";
import type { CreateProjectState } from "../model/create-project-state";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;
// `/p/new`는 정적 라우트라 `/p/[slug]`보다 먼저 잡힌다 — slug "new"인 프로젝트는 열 수 없다.
const RESERVED_SLUGS = new Set(["new"]);

export async function createProject(_prev: CreateProjectState, form: FormData): Promise<CreateProjectState> {
  const { userId } = await requireUser();
  const s = (k: string) => String(form.get(k) ?? "").trim();
  const slug = s("slug"), owner = s("owner"), repo = s("repo"), branch = s("branch") || "main", name = s("name") || slug;
  if (!SLUG_RE.test(slug)) return { error: "slug: 소문자·숫자·하이픈, 2~40자" };
  if (RESERVED_SLUGS.has(slug)) return { error: `예약된 slug: ${slug}` };
  if (!owner || !repo) return { error: "GitHub owner/repo는 필수" };
  if (await prisma.project.findUnique({ where: { slug } })) return { error: `이미 있는 slug: ${slug}` };
  const { plain, hash } = newToken();
  await prisma.project.create({
    data: { slug, name, owner, repo, branch, members: { create: { userId, role: "owner" } }, tokens: { create: { hash, label: "initial" } } },
  });
  return { slug, token: plain }; // 평문은 이 응답에만 존재한다. 저장하지 않는다.
}
