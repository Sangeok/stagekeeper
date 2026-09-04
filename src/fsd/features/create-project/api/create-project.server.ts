"use server";
import { capError } from "@harness/core/entitlement.mjs";
import { newToken } from "@harness/core/token.mjs";
import { Prisma } from "@/generated/prisma/client";
import { requireUser } from "@/server/auth/guard";
import { prisma } from "@/server/db";
import { planForUser } from "@/server/entitlement";
import type { CreateProjectState } from "../model/create-project-state";
import { RESERVED_SLUGS, SLUG_ERROR, SLUG_RE } from "../model/project-slug";
import { SEGMENT } from "../model/repo-url";

const field = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

export async function createProject(_prev: CreateProjectState, form: FormData): Promise<CreateProjectState> {
  const { userId } = await requireUser();
  const slug = field(form, "slug");
  const owner = field(form, "owner");
  const repo = field(form, "repo");
  const branch = field(form, "branch") || "main";
  const name = field(form, "name") || slug;
  if (!SLUG_RE.test(slug)) return { status: "error", error: SLUG_ERROR };
  if (RESERVED_SLUGS.has(slug)) return { status: "error", error: `'${slug}' is reserved.` };
  if (!owner || !repo) return { status: "error", error: "GitHub owner and repo are required." };
  // 형식도 서버에서 본다. 붙여넣기 경로만 SEGMENT를 통과했고 수동 입력은 무검증이었다 —
  // 그렇게 들어온 값은 저장된 뒤 모든 화면의 저장소 링크를 깨진 채로 만든다.
  // branch는 여기서 걸지 않는다 — git 브랜치 이름은 `release/1.0`처럼 슬래시를 담을 수 있어
  // SEGMENT로 재면 정상 브랜치를 막는다. 규칙을 새로 지어내는 건 이 변경의 범위 밖이다.
  if (!SEGMENT.test(owner) || !SEGMENT.test(repo)) {
    return { status: "error", error: "GitHub owner and repo must be GitHub names — letters, numbers, dots, dashes, underscores." };
  }
  if (await prisma.project.findUnique({ where: { slug } })) return { status: "error", error: `'${slug}' is already taken.` };
  const { plain, hash } = newToken();
  const plan = await planForUser(userId);
  try {
    // 상한 검사와 생성은 한 트랜잭션이다 — 따로 두면 동시에 온 두 요청이 둘 다 "아직 여유 있음"을
    // 읽고 둘 다 만든다(board.ts:71의 미결 상한과 같은 이유).
    const capped = await prisma.$transaction(async (tx) => {
      const owned = await tx.projectMember.count({ where: { userId, role: "owner" } });
      const capMsg = capError(plan, "projects", owned);
      if (capMsg) return capMsg;
      await tx.project.create({
        data: { slug, name, owner, repo, branch, members: { create: { userId, role: "owner" } }, tokens: { create: { hash, label: "initial" } } },
      });
      return null;
    });
    if (capped) return { status: "error", error: capped };
  } catch (error) {
    // 위 findUnique 이후에 다른 요청이 같은 slug를 먼저 넣었을 때 — 같은 답을 준다.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { status: "error", error: `'${slug}' is already taken.` };
    }
    throw error;
  }
  return { status: "created", slug, token: plain }; // 평문은 이 응답에만 존재한다. 저장하지 않는다.
}
