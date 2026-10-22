export type RunnerMode = "session" | "resident";
export type RunnerStateName = "idle" | "working" | "waiting" | "stopped";
export type RunnerWaitReason = "dirty" | "branch";
export type RunnerPermission = "auto" | "allowlist";
export type RunnerStopReason = "owner" | "stuck" | "error" | "plan";
export type RunnerAutostartState = "on" | "off" | "refused";
export type RunnerSigninCode = "dirty" | "autostart-branch" | "detached" | "push-url" | "locked" | "other";

export type RunnerRecord = {
  session: string;
  mode: RunnerMode;
  host: string;
  branch: string | null;
  permission: RunnerPermission | null;
  autostart: boolean;
  state: RunnerStateName;
  waitReason: RunnerWaitReason | null;
  lastResult: string | null;
  lastLog: string | null;
  stopReason: RunnerStopReason | "signin" | null;
  startedAt: Date;
  seenAt: Date;
};

export type RunnerView = {
  runner: RunnerRecord | null;
  pausedAt: Date | null;
  lastActivity: Date | null;
  renderedAt: Date;
};

export type RunnerHolder = { mode: RunnerMode; host: string; seenAt: string };

export type RunnerOp =
  | { op: "start"; session: string; mode: RunnerMode; host: string; branch: string | null; permission: RunnerPermission | null; autostart: boolean; takeover: boolean }
  | { op: "beat"; session: string; state: Exclude<RunnerStateName, "stopped"> | null; waitReason: RunnerWaitReason | null; lastResult: string | null; lastLog: string | null }
  | { op: "stop"; session: string; reason: RunnerStopReason }
  | { op: "autostart"; session: string; state: RunnerAutostartState; host: string; branch: string | null; code: RunnerSigninCode | null };

export type RunnerOpResult =
  | { ok: true; body: { ok: true; paused?: boolean; stop?: "plan" } }
  | { ok: false; status: 403; reason: string; code?: never }
  | { ok: false; status: 403; reason: string; code: "PLAN_REQUIRED" }
  | { ok: false; status: 409; reason: string; code: "RUNNER_BUSY"; holder: RunnerHolder }
  | { ok: false; status: 409; reason: string; code: "RUNNER_REPLACED" };
