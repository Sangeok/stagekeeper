import { STEP_HEADING, stubOf } from "@harness/core/templates/deliver.mjs";
import { STATUSES } from "@harness/core/pipeline/transitions.mjs";

const DERIVED_REQUIREMENTS = ["verify-ok", "can-propose"] as const;
export const REQUIREMENTS: readonly string[] = [...STATUSES, ...DERIVED_REQUIREMENTS];
export const DONE = "done";

export type Step = {
  id: string;
  requires: string[];
  body: string;
  next: string[];
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
    if (!cur) throw new TemplateFormatError("unreachable: text before first step");
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
