import { z } from "zod";

export const inputSchema = z.object({
  targetProjectId: z.string().min(1),
  replacementProjectId: z.string().min(1).optional(),
  expectedVersion: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
});

export type SelectProjectInput = z.input<typeof inputSchema>;
