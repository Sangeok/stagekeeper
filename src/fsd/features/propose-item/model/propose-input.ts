import { z } from "zod";

export const proposeInputSchema = z.object({ key: z.string().min(1), agent: z.string().min(1), reason: z.string() });
