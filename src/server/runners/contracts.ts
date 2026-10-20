// 실행기 모듈 밖이 쓰는 타입. 값 목록은 packages/core/runner.mjs가 소유한다.
// FSD의 model/ui는 이 파일을 읽지 않는다 — api adapter가 위젯 model의 타입으로 옮긴다.
export type RunnerMode = "session" | "resident";
export type RunnerStateName = "idle" | "working" | "waiting" | "stopped";
export type RunnerWaitReason = "dirty" | "branch";
export type RunnerPermission = "auto" | "allowlist";
export type RunnerStopReason = "owner" | "stuck" | "error" | "plan";

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
  stopReason: Exclude<RunnerStopReason, "owner"> | null;
  startedAt: Date;
  seenAt: Date;
};

// 배너·목록이 읽는 한 프로젝트의 실행기 사실. renderedAt은 같은 조회에서 읽은 DB 시각이다 —
// 판정의 "지금"을 앱 서버 시계가 아닌 lease 판정과 같은 시계로 맞춘다.
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
  | { op: "stop"; session: string; reason: RunnerStopReason };

export type RunnerOpResult =
  | { ok: true; body: { ok: true; paused?: boolean; stop?: "plan" } }
  | { ok: false; status: 403; reason: string; code?: never }
  | { ok: false; status: 403; reason: string; code: "PLAN_REQUIRED" }
  | { ok: false; status: 409; reason: string; code: "RUNNER_BUSY"; holder: RunnerHolder }
  | { ok: false; status: 409; reason: string; code: "RUNNER_REPLACED" };
