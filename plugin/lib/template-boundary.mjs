export const STEP_HEADING = /^## step:(\S+)(.*)$/;

export function stubOf(body) {
  const lines = body.split(/\r?\n/);
  const first = lines.findIndex((line) => STEP_HEADING.test(line));
  return first < 0 ? body : lines.slice(0, first).join("\n").trimEnd() + "\n";
}
