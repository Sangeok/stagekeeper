"use server";
import { newToken } from "@harness/core/token.mjs";
import { Prisma } from "@/generated/prisma/client";
import { requireUser } from "@/server/auth/guard";
import { prisma } from "@/server/db";
import { AvailabilityConflict, withAvailabilityTransaction } from "@/server/project-availability-service";
import { registerProjectResultIn } from "@/server/project-registration-query";
import type { CreateProjectState } from "../model/create-project-state";
import { RESERVED_SLUGS, SLUG_ERROR, SLUG_RE } from "../model/project-slug";
import { SEGMENT } from "../model/repo-url";
import { toCreateProjectState } from "../model/create-project-result";

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
  // SEGMENT로 재면 정상 브랜치를 막는다.
  if (!SEGMENT.test(owner) || !SEGMENT.test(repo)) {
    return { status: "error", error: "GitHub owner and repo must be GitHub names — letters, numbers, dots, dashes, underscores." };
  }
  const { plain, hash } = newToken();
  try {
    // 상한 검사와 생성은 한 트랜잭션이다 — 따로 두면 동시에 온 두 요청이 둘 다 "아직 여유 있음"을
    // 읽고 둘 다 만든다(board-query.ts propose의 미결 상한과 같은 이유).
    const result = await withAvailabilityTransaction(prisma, (tx) => registerProjectResultIn(tx, {
      userId,
      slug,
      name,
      owner,
      repo,
      branch,
      initialTokenHash: hash,
    }));
    return toCreateProjectState(result, plain);
  } catch (error) {
    if (error instanceof AvailabilityConflict) return { status: "error", error: error.message };
    // 전역 slug의 저장 경쟁은 현재 Prisma adapter의 두 metadata 형태를 모두 처리한다.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
      && JSON.stringify(error.meta?.target ?? error.meta?.driverAdapterError ?? "").includes("slug")) {
      return { status: "error", error: `'${slug}' is already taken.` };
    }
    throw error;
  }
}
