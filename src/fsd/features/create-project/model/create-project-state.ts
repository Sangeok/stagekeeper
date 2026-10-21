export type CreateProjectState =
  | { status: "idle" }
  | { status: "error"; error: string }
  | { status: "existing"; slug: string }
  | { status: "disconnected"; slug: string }
  | { status: "created"; slug: string; token: string };

export const IDLE: CreateProjectState = { status: "idle" };
