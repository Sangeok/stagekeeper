import { createElement, type ReactElement, type ReactNode } from "react";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

export function withAppRouterTestContext(element: ReactNode, overrides: Partial<AppRouterInstance> = {}): ReactElement {
  const router: AppRouterInstance = {
    bfcacheId: "test",
    back() {},
    forward() {},
    refresh() {},
    push() {},
    replace() {},
    prefetch() {},
    ...overrides,
  };
  return createElement(AppRouterContext.Provider, { value: router }, element);
}
