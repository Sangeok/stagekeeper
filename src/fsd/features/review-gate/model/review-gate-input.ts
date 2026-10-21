import { z } from "zod";

const dateString = z.string().min(1).refine((value) => !Number.isNaN(new Date(value).getTime()));
const itemInput = { key: z.string().min(1), expectedUpdatedAt: dateString };

export const retryAcceptanceInputSchema = z.object(itemInput);
export const transitionInputSchema = z.object({ ...itemInput, to: z.string().min(1), result: z.string().optional() });
export const approveGateInputSchema = z.object({
  ...itemInput,
  gate: z.string().min(1),
  gateEntry: z.object({ runId: z.string().min(1), entryId: z.string().min(1) }).optional(),
});
export const discardInputSchema = z.object(itemInput);

export type RetryAcceptanceInput = z.input<typeof retryAcceptanceInputSchema>;
export type TransitionInput = z.input<typeof transitionInputSchema>;
export type ApproveGateInput = z.input<typeof approveGateInputSchema>;
export type DiscardInput = z.input<typeof discardInputSchema>;
