import { z } from "zod";

// 기존 Date 파싱 범위는 유지하되 transport의 숫자/null 자동 변환은 막는다.
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
