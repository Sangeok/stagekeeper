import { z } from "zod";

export const proposeInputSchema = z.object({ pipelineId: z.string().min(1), key: z.string().min(1), agent: z.string().min(1), reason: z.string() });

export type ProposeInput = z.input<typeof proposeInputSchema>;
