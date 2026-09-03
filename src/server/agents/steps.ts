// 순수. DB·프레임워크 없음. 에이전트 템플릿(private 저장소의 마크다운)을 "파일로 내려가는 스텁"과
// "agent_next가 한 번에 하나씩 주는 단계"로 나눈다. 형식은 이 파일이 유일한 정의다:
//
//   (첫 `## step:` 앞까지 = 스텁. frontmatter 포함, 그대로 .claude/agents/<x>.md 가 된다.
//    경계 정규식과 자르기는 packages/core/deliver.mjs — /api/templates가 같은 경계로 스텁을 내려준다)
//   ## step:<id>   requires: <req>, <req>
//   (본문)
//   next: <id|done> [| <id> …] — 필수, 한 줄. `a | b`면 requires가 맞는 첫 후보로 간다(보드 상태로 갈라지는 자리 — dev start)
//   on failed: <id>            — 선택. 없으면 실패해도 현재 단계에 머문다
//   on blocked: <id>           — 선택. 없으면 막혀도 현재 단계에 머문다
//
// 지시어는 이 셋(+ 제목의 requires:)뿐이다. 모르는 지시어·중복 id·없는 id 참조·모르는 requires 값은
// 예외로 던진다 — 서빙 중 500이 아니라 시드 시점에 걸리게 하려는 것이다(seed-templates.ts가 먼저 파싱한다).
// 단계가 하나도 없는 본문(runbook·docs 템플릿)은 stub = 본문 전체, steps = [] 로 그대로 통과한다.
import { STEP_HEADING, stubOf } from "@harness/core/deliver.mjs";
import { STATUSES } from "@harness/core/transitions.mjs";

// requires: 어휘. 보드 상태 이름은 항목(key)의 최신 상태, 나머지 둘은 파생 조건이다:
//   verify-ok   — 같은 (프로젝트, agent, key)에 `verify` 단계 ok 기록이 있다
//   can-propose — 프로젝트의 미결 항목이 2개 미만이다 (transitions.mjs canPropose)
export const DERIVED_REQUIREMENTS = ["verify-ok", "can-propose"] as const;
export const REQUIREMENTS: readonly string[] = [...STATUSES, ...DERIVED_REQUIREMENTS];
export const DONE = "done"; // next: 의 종결 값. 단계 id로는 쓸 수 없다

export type Step = {
  id: string;
  requires: string[];
  body: string;
  next: string[]; // 후보 순서대로. 첫 후보의 requires가 맞지 않으면 다음 후보
  onFailed?: string;
  onBlocked?: string;
};
export type ParsedTemplate = { stub: string; steps: Step[] };

export class TemplateFormatError extends Error {
  constructor(message: string) { super(message); this.name = "TemplateFormatError"; }
}

const HEADING = STEP_HEADING;
const ID = /^[a-z][a-z0-9-]*$/;
const DIRECTIVE = /^(next|on failed|on blocked|requires|on [a-z-]+):\s*(.*)$/;

export function splitTemplate(body: string): ParsedTemplate {
  const lines = body.split(/\r?\n/);
  const first = lines.findIndex((l) => HEADING.test(l));
  if (first < 0) return { stub: body, steps: [] };

  const stub = stubOf(body);
  const steps: Step[] = [];
  let cur: (Omit<Step, "next" | "body"> & { next?: string[]; lines: string[] }) | null = null;
  let fenced = false;

  const close = () => {
    if (!cur) return;
    const text = cur.lines.join("\n").trim();
    if (!text) throw new TemplateFormatError(`step "${cur.id}": empty body`);
    if (!cur.next) throw new TemplateFormatError(`step "${cur.id}": missing next:`);
    steps.push({ id: cur.id, requires: cur.requires, body: text, next: cur.next, onFailed: cur.onFailed, onBlocked: cur.onBlocked });
  };

  for (const line of lines.slice(first)) {
    const heading = HEADING.exec(line);
    if (heading && !fenced) {
      close();
      const [, id, rest] = heading;
      if (!ID.test(id) || id === DONE) throw new TemplateFormatError(`bad step id "${id}"`);
      if (steps.some((s) => s.id === id)) throw new TemplateFormatError(`duplicate step id "${id}"`);
      cur = { id, requires: parseRequires(id, rest.trim()), lines: [] };
      continue;
    }
    if (!cur) throw new TemplateFormatError("unreachable: text before first step"); // first는 heading이다
    if (/^```/.test(line)) fenced = !fenced;
    const d = fenced ? null : DIRECTIVE.exec(line);
    if (!d) { cur.lines.push(line); continue; }
    const [, name, value] = d;
    const target = value.trim();
    if (!target) throw new TemplateFormatError(`step "${cur.id}": ${name}: needs a step id`);
    if (name === "next") {
      if (cur.next) throw new TemplateFormatError(`step "${cur.id}": next: given twice`);
      cur.next = target.split("|").map((s) => s.trim());
      if (cur.next.some((t) => !t)) throw new TemplateFormatError(`step "${cur.id}": next: has an empty candidate`);
    } else if (name === "on failed") {
      if (cur.onFailed) throw new TemplateFormatError(`step "${cur.id}": on failed: given twice`);
      cur.onFailed = target;
    } else if (name === "on blocked") {
      if (cur.onBlocked) throw new TemplateFormatError(`step "${cur.id}": on blocked: given twice`);
      cur.onBlocked = target;
    } else {
      throw new TemplateFormatError(`step "${cur.id}": unknown directive "${name}:"`);
    }
  }
  close();

  const ids = new Set(steps.map((s) => s.id));
  for (const s of steps) {
    for (const ref of [...s.next, s.onFailed, s.onBlocked]) {
      if (ref !== undefined && ref !== DONE && !ids.has(ref)) throw new TemplateFormatError(`step "${s.id}": references unknown step "${ref}"`);
    }
  }
  return { stub, steps };
}

// 제목 뒤에는 `requires: a, b`만 올 수 있다. 다른 텍스트는 오타로 보고 거부한다.
function parseRequires(id: string, rest: string): string[] {
  if (!rest) return [];
  const m = /^requires:\s*(.+)$/.exec(rest);
  if (!m) throw new TemplateFormatError(`step "${id}": unexpected text after id: "${rest}"`);
  const reqs = m[1].split(",").map((s) => s.trim()).filter(Boolean);
  if (!reqs.length) throw new TemplateFormatError(`step "${id}": requires: is empty`);
  for (const r of reqs) if (!REQUIREMENTS.includes(r)) throw new TemplateFormatError(`step "${id}": unknown requirement "${r}"`);
  return reqs;
}

export function findStep(parsed: ParsedTemplate, id: string): Step | undefined {
  return parsed.steps.find((s) => s.id === id);
}
