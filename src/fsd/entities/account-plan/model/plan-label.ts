import type { Plan } from "@harness/shared/plans/limits.mjs";

const PLAN_LABEL: Record<Plan, string> = { free: "Free", pro: "Pro", max: "Max" };
export const planLabel = (plan: Plan): string => PLAN_LABEL[plan];
