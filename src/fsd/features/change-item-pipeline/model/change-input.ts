import { z } from "zod";

export const changePipelineInputSchema = z.object({
  key: z.string().min(1), pipelineId: z.string().min(1),
  expectedUpdatedAt: z.iso.datetime().refine(value => Number.isFinite(new Date(value).getTime())),
});

export type ChangePipelineInput = z.input<typeof changePipelineInputSchema>;
