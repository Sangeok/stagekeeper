import { z } from "zod";

export const inputSchema = z.object({
  targetProjectId: z.string().min(1),
  expectedVersion: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
});

export type ProjectConnectionInput = z.input<typeof inputSchema>;
