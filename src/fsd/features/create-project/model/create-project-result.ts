import type { CreateProjectState } from "./create-project-state";

type RegistrationResult =
  | { status: "created" | "existing"; slug: string }
  | { status: "disconnected"; slug: string; reason: string }
  | { status: "capped" | "integrity"; reason: string };

export function toCreateProjectState(result: RegistrationResult, createdToken: string): CreateProjectState {
  switch (result.status) {
    case "created": return { status: "created", slug: result.slug, token: createdToken };
    case "existing": return { status: "existing", slug: result.slug };
    case "disconnected": return { status: "disconnected", slug: result.slug };
    case "capped":
    case "integrity": return { status: "error", error: result.reason };
    default: { const unreachable: never = result; return unreachable; }
  }
}
