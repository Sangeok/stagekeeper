import type { Plan } from "@harness/core/entitlement.mjs";

const PLAN_LABEL: Record<Plan, string> = { free: "Free", pro: "Pro", max: "Max" };
export const planLabel = (plan: Plan): string => PLAN_LABEL[plan];
