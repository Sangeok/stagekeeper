// 서버의 실행기 경로(POST /api/runner) 호출과 응답 분류. MCP 도구가 아니다 — 에이전트 모델은 이 경로를 모른다.
// 분류만 하고 결정은 부르는 쪽(watch·session CLI)이 한다. 토큰은 환경에서 받은 값을 헤더로만 보낸다.
import os from "node:os";
import { RUNNER_HOST_MAX } from "../lib/runner.mjs";

const BODY_LIMIT = 64 * 1024;
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

// 실행기 PC 이름. 서버 열은 64자까지다.
export function runnerHost() {
  const name = os.hostname().trim().slice(0, RUNNER_HOST_MAX);
  return name.length > 0 ? name : "unknown";
}

function retryAfter(header) {
  if (header === null) return 0;
  if (/^\d+(?:\.\d+)?$/.test(header)) return Number(header) * 1000;
  const at = Date.parse(header);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : 0;
}

async function readJson(response) {
  const text = await response.text();
  if (text.length > BODY_LIMIT) return null;
  try { return JSON.parse(text); } catch { return null; }
}

/**
 * @param {{ server: string, token: string, project: string | null }} target
 * @param {Record<string, unknown>} payload op·session과 op별 필드
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<
 *   | { kind: "ok", paused: boolean, stop: "plan" | null }
 *   | { kind: "busy", holder: { mode: string, host: string, seenAt: string } }
 *   | { kind: "replaced" }
 *   | { kind: "plan" }
 *   | { kind: "missing" }
 *   | { kind: "transient", retryAfter: number }
 *   | { kind: "refused", status: number, reason: string | null }>}
 */
export async function runnerCall(target, payload, { signal } = {}) {
  let response;
  try {
    response = await fetch(`${target.server}/api/runner`, { method: "POST", redirect: "manual", signal,
      headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${target.token}` },
      body: JSON.stringify({ ...payload, ...(target.project ? { project: target.project } : {}) }) });
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    return { kind: "transient", retryAfter: 0 };
  }
  // 경로가 없는 서버(롤백·옛 판). 부르는 쪽이 로컬 잠금만으로 계속 돈다.
  if (response.status === 404) { await response.body?.cancel().catch(() => {}); return { kind: "missing" }; }
  if (response.status === 408 || response.status === 429 || response.status >= 500) {
    await response.body?.cancel().catch(() => {});
    return { kind: "transient", retryAfter: response.status === 429 ? retryAfter(response.headers.get("retry-after")) : 0 };
  }
  let body;
  try { body = await readJson(response); }
  catch (error) {
    if (signal?.aborted) throw signal.reason;
    return { kind: "transient", retryAfter: 0 };
  }
  if (response.status === 200 && isObject(body) && body.ok === true) {
    return { kind: "ok", paused: body.paused === true, stop: body.stop === "plan" ? "plan" : null };
  }
  const code = isObject(body) ? body.code : undefined;
  if (response.status === 409 && code === "RUNNER_BUSY" && isObject(body.holder)
    && typeof body.holder.mode === "string" && typeof body.holder.host === "string" && typeof body.holder.seenAt === "string") {
    return { kind: "busy", holder: { mode: body.holder.mode, host: body.holder.host, seenAt: body.holder.seenAt } };
  }
  if (response.status === 409 && code === "RUNNER_REPLACED") return { kind: "replaced" };
  if (response.status === 403 && code === "PLAN_REQUIRED") return { kind: "plan" };
  return { kind: "refused", status: response.status, reason: isObject(body) && typeof body.error === "string" ? body.error : null };
}

// 시간 제한을 둔 한 번의 호출. 끝나지 않으면 일시적 실패로 본다.
export async function runnerCallWithin(target, payload, timeoutMs) {
  const signal = AbortSignal.timeout(Math.max(1, Math.ceil(timeoutMs)));
  try { return await runnerCall(target, payload, { signal }); }
  catch { return { kind: "transient", retryAfter: 0 }; }
}
