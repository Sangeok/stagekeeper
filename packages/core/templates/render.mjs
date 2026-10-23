export function renderTemplate(text, vars) {
  return text.replace(/\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g, (_, key) => {
    const v = key.split(".").reduce((o, k) => (o === undefined || o === null ? undefined : o[k]), vars);
    if (v === undefined) throw new Error(`template var missing: ${key}`);
    return String(v);
  });
}
