// 플랜의 표시 이름만 소유한다. 한도는 core, Billing 전용 표는 pages/billing에 둔다.
import type { Plan } from "@harness/core/entitlement.mjs";

const PLAN_LABEL: Record<Plan, string> = { free: "Free", pro: "Pro", max: "Max" };
export const planLabel = (plan: Plan): string => PLAN_LABEL[plan];
