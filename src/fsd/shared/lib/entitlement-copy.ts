// 여러 화면에서 쓰는 플랜 이름. Billing 전용 표와 안내는 pages/billing/model이 소유한다.
import type { Plan } from "@harness/core/entitlement.mjs";

const PLAN_LABEL: Record<Plan, string> = { free: "Free", pro: "Pro", max: "Max" };
export const planLabel = (plan: Plan): string => PLAN_LABEL[plan];
