import { z } from "zod";
import type { SavePipelineInput } from "./pipeline-save-state";

export const savePipelineInputSchema = z.object({
  pipelineId: z.string().nullable(),
  name: z.string().optional(),
  definition: z.object({ steps: z.array(z.string()), gates: z.array(z.string()), selectionPolicy: z.string().trim().min(1).max(3000).optional() }),
  expectedVersion: z.number().int().min(0).max(2_147_483_646),
}) satisfies z.ZodType<SavePipelineInput>;
