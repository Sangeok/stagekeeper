"use server";
import { newToken } from "@harness/core/token.mjs";
import { Prisma } from "@/generated/prisma/client";
import { requireUser } from "@/server/auth/guard";
import { prisma } from "@/server/db";
import type { CreateProjectState } from "../model/create-project-state";
import { RESERVED_SLUGS, SLUG_ERROR, SLUG_RE } from "../model/project-slug";

const field = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

export async function createProject(_prev: CreateProjectState, form: FormData): Promise<CreateProjectState> {
  const { userId } = await requireUser();
  const slug = field(form, "slug");
  const owner = field(form, "owner");
  const repo = field(form, "repo");
  const branch = field(form, "branch") || "main";
  const name = field(form, "name") || slug;
  if (!SLUG_RE.test(slug)) return { error: SLUG_ERROR };
  if (RESERVED_SLUGS.has(slug)) return { error: `'${slug}' is reserved.` };
  if (!owner || !repo) return { error: "GitHub owner and repo are required." };
  if (await prisma.project.findUnique({ where: { slug } })) return { error: `'${slug}' is already taken.` };
  const { plain, hash } = newToken();
  try {
    await prisma.project.create({
      data: { slug, name, owner, repo, branch, members: { create: { userId, role: "owner" } }, tokens: { create: { hash, label: "initial" } } },
    });
  } catch (error) {
    // 위 findUnique 이후에 다른 요청이 같은 slug를 먼저 넣었을 때 — 같은 답을 준다.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: `'${slug}' is already taken.` };
    }
    throw error;
  }
  return { slug, token: plain }; // 평문은 이 응답에만 존재한다. 저장하지 않는다.
}
