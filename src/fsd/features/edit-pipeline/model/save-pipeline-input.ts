import { z } from "zod";
import type { SavePipelineInput } from "./pipeline-save-state";

// 서버에서만 쓴다. pipeline-save-state.ts는 클라이언트도 가져가므로 zod를 거기에 두지 않는다.
// expectedVersion의 상한은 저장 후 다음 판(+1)이 Prisma Int에 들어가는 값까지다.
export const savePipelineInputSchema = z.object({
  pipelineId: z.string().nullable(),
  name: z.string().optional(),
  definition: z.object({ steps: z.array(z.string()), gates: z.array(z.string()) }),
  expectedVersion: z.number().int().min(0).max(2_147_483_646),
}) satisfies z.ZodType<SavePipelineInput>;
