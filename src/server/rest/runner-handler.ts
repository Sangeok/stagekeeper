import {
  RUNNER_AUTOSTART_STATES, RUNNER_BRANCH_MAX, RUNNER_HOST_MAX, RUNNER_LOG_MAX, RUNNER_MODES, RUNNER_PERMISSIONS, RUNNER_RESULT_MAX,
  RUNNER_SIGNIN_CODES, RUNNER_STOP_REASONS, RUNNER_WAIT_REASONS,
} from "@harness/core/runner.mjs";
import { failureBody, type RequestRateFailure } from "@/server/result";
import type { ProjectAccess } from "@/server/projects/contracts";
import type { RunnerOp, RunnerOpResult } from "@/server/runners/contracts";
import { resolveRestScope, type RestTokenDeps } from "./scope";
import type { RestRateFailure } from "./response";

export const INVALID_RUNNER_REQUEST = "Invalid runner request.";

export type RunnerRequestResult = RunnerOpResult | { ok: false; status: 400 | 401 | 403; reason: string; code?: never } | RestRateFailure;

export type RunnerDeps = RestTokenDeps & {
  requestLimit(projectId: string): Promise<RequestRateFailure | null>;
  projectAccess(projectId: string): Promise<ProjectAccess>;
  runnerOp(input: { projectId: string; tokenId: string; request: RunnerOp }): Promise<RunnerOpResult>;
};

const SESSION_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEYS = {
  start: ["mode", "host", "branch", "permission", "autostart", "takeover"],
  beat: ["state", "waitReason", "lastResult", "lastLog"],
  stop: ["reason"],
  autostart: ["state", "host", "branch", "code"],
} as const;
const COMMON = ["op", "project", "session"];

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const oneOf = <T extends string>(values: readonly T[], value: unknown): value is T => typeof value === "string" && (values as readonly string[]).includes(value);
const text = (value: unknown, max: number): value is string => typeof value === "string" && value.length >= 1 && value.length <= max;
const optional = <T>(body: Record<string, unknown>, key: string, check: (value: unknown) => value is T): T | null | undefined =>
  body[key] === undefined ? null : check(body[key]) ? body[key] as T : undefined;
const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";
const isLogName = (value: unknown): value is string => text(value, RUNNER_LOG_MAX) && !/[\\/]/.test(value);

export function parseRunnerRequest(body: unknown): RunnerOp | null {
  if (!isRecord(body) || !oneOf(["start", "beat", "stop", "autostart"] as const, body.op)) return null;
  const op = body.op;
  if (Object.keys(body).some((key) => !COMMON.includes(key) && !(KEYS[op] as readonly string[]).includes(key))) return null;
  if (typeof body.session !== "string" || !SESSION_RE.test(body.session)) return null;
  const session = body.session.toLowerCase();
  if (op === "start") {
    if (!oneOf(RUNNER_MODES, body.mode) || !text(body.host, RUNNER_HOST_MAX)) return null;
    const branch = optional(body, "branch", (value): value is string => text(value, RUNNER_BRANCH_MAX));
    const permission = optional(body, "permission", (value): value is (typeof RUNNER_PERMISSIONS)[number] => oneOf(RUNNER_PERMISSIONS, value));
    const autostart = optional(body, "autostart", isBoolean);
    const takeover = optional(body, "takeover", isBoolean);
    if (branch === undefined || permission === undefined || autostart === undefined || takeover === undefined) return null;
    if (body.mode === "resident" && (branch === null || permission === null)) return null;
    return { op, session, mode: body.mode, host: body.host, branch, permission, autostart: autostart ?? false, takeover: takeover ?? false };
  }
  if (op === "beat") {
    const state = optional(body, "state", (value): value is "idle" | "working" | "waiting" => oneOf(["idle", "working", "waiting"] as const, value));
    const waitReason = optional(body, "waitReason", (value): value is (typeof RUNNER_WAIT_REASONS)[number] => oneOf(RUNNER_WAIT_REASONS, value));
    const lastResult = optional(body, "lastResult", (value): value is string => text(value, RUNNER_RESULT_MAX));
    const lastLog = optional(body, "lastLog", isLogName);
    if (state === undefined || waitReason === undefined || lastResult === undefined || lastLog === undefined) return null;
    if ((state === "waiting") !== (waitReason !== null)) return null;
    return { op, session, state, waitReason, lastResult, lastLog };
  }
  if (op === "autostart") {
    if (!oneOf(RUNNER_AUTOSTART_STATES, body.state) || !text(body.host, RUNNER_HOST_MAX)) return null;
    const branch = optional(body, "branch", (value): value is string => text(value, RUNNER_BRANCH_MAX));
    const code = optional(body, "code", (value): value is (typeof RUNNER_SIGNIN_CODES)[number] => oneOf(RUNNER_SIGNIN_CODES, value));
    if (branch === undefined || code === undefined) return null;
    if ((body.state === "refused") !== (code !== null) || (body.state !== "off" && branch === null)) return null;
    return { op, session, state: body.state, host: body.host, branch, code };
  }
  if (!oneOf(RUNNER_STOP_REASONS, body.reason)) return null;
  return { op, session, reason: body.reason };
}

const projectOf = (body: unknown): string | null => {
  if (!isRecord(body) || typeof body.project !== "string" || body.project.length === 0) return null;
  return body.project;
};

type RunnerRequest = (authorizationHeader: string | null, body: unknown) => Promise<RunnerRequestResult>;

export function makeRunnerRequest(deps: RunnerDeps): RunnerRequest {
  return async function runnerRequest(authorizationHeader, body) {
    const scope = await resolveRestScope(deps, authorizationHeader, projectOf(body));
    if (!scope.ok) return scope;

    const access = await deps.projectAccess(scope.projectId);
    if (!access.available) return { ok: false, status: 403, reason: access.reason };

    const limited = await deps.requestLimit(scope.projectId);
    if (limited) return { ...limited, status: 429 };
    const request = parseRunnerRequest(body);
    if (request === null) return { ok: false, status: 400, reason: INVALID_RUNNER_REQUEST };

    return deps.runnerOp({ projectId: scope.projectId, tokenId: scope.tokenId, request });
  };
}

export function runnerResponse(result: RunnerRequestResult): Response {
  if (result.ok) return Response.json(result.body);
  if (result.code === "RATE_LIMITED") {
    return Response.json(failureBody(result), { status: result.status, headers: { "Retry-After": String(result.retryAfterSec) } });
  }
  if (result.code === "RUNNER_BUSY") return Response.json({ error: result.reason, code: result.code, holder: result.holder }, { status: result.status });
  if (result.code !== undefined) return Response.json({ error: result.reason, code: result.code }, { status: result.status });
  return Response.json({ error: result.reason }, { status: result.status });
}
