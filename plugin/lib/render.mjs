// 순수. {{path.to.var}} 치환만 한다. 조건·반복은 없다 — 목록은 vars.mjs가 미리 문자열로 만든다(YAGNI).
export function renderTemplate(text, vars) {
  return text.replace(/\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g, (_, key) => {
    const v = key.split(".").reduce((o, k) => (o === undefined || o === null ? undefined : o[k]), vars);
    if (v === undefined) throw new Error(`template var missing: ${key}`);
    return String(v);
  });
}
