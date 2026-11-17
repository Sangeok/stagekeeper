import path from "node:path";

const utf8 = new TextDecoder("utf-8", { fatal: true });

export class ObservationProtocolError extends Error {}

function decode(bytes) {
  try { return utf8.decode(bytes); }
  catch { throw new ObservationProtocolError("invalid-encoding"); }
}

export function decodeLsofName(value) {
  if (value.includes("^")) throw new ObservationProtocolError("ambiguous-name");
  const chunks = [];
  let cursor = 0;
  for (const match of value.matchAll(/\\(\\|[bfrnt]|x[0-9a-fA-F]{2})/g)) {
    const prefix = value.slice(cursor, match.index);
    if (prefix.includes("\\")) throw new ObservationProtocolError("invalid-name");
    chunks.push(Buffer.from(prefix));
    const escaped = match[1];
    chunks.push(escaped[0] === "x" ? Buffer.from([Number.parseInt(escaped.slice(1), 16)])
      : Buffer.from({ "\\": "\\", b: "\b", f: "\f", r: "\r", n: "\n", t: "\t" }[escaped]));
    cursor = match.index + match[0].length;
  }
  const suffix = value.slice(cursor);
  if (suffix.includes("\\")) throw new ObservationProtocolError("invalid-name");
  chunks.push(Buffer.from(suffix));
  return decode(Buffer.concat(chunks));
}

export function parseProcessInventory(bytes, uid) {
  const result = new Map();
  for (const line of decode(bytes).split("\n").filter(line => line.trim())) {
    const match = /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.+?)\s*$/.exec(line);
    if (!match) throw new ObservationProtocolError("invalid-inventory");
    const [, user, id, state, started] = match;
    const pid = Number(id);
    if (!Number.isSafeInteger(pid) || pid <= 0 || result.has(pid)) throw new ObservationProtocolError("invalid-inventory");
    if (Number(user) === uid && !state.startsWith("Z")) result.set(pid, started);
  }
  if (!result.size) throw new ObservationProtocolError("empty-inventory");
  return result;
}

export function parseLsofCwds(bytes) {
  const text = decode(bytes);
  if (!text.endsWith("\0\n")) throw new ObservationProtocolError("truncated-lsof");
  const result = new Map();
  let pid = null, descriptor = null;
  for (let field of text.split("\0")) {
    if (field === "\n") continue;
    if (field.startsWith("\n")) field = field.slice(1);
    if (!field) throw new ObservationProtocolError("invalid-field");
    const kind = field[0], value = field.slice(1);
    if (kind === "p") {
      if (!/^[1-9]\d*$/.test(value) || descriptor === "cwd") throw new ObservationProtocolError("invalid-process");
      pid = Number(value);
      if (!Number.isSafeInteger(pid) || pid > 0xffffffff) throw new ObservationProtocolError("invalid-process");
      descriptor = null;
    } else if (kind === "f") {
      if (!pid || descriptor === "cwd" || value !== "cwd") throw new ObservationProtocolError("invalid-descriptor");
      descriptor = value;
    } else if (kind === "n") {
      if (!pid || descriptor !== "cwd" || result.has(pid)) throw new ObservationProtocolError("invalid-name");
      const cwd = decodeLsofName(value);
      if (!path.posix.isAbsolute(cwd) || cwd.includes("\0")) throw new ObservationProtocolError("invalid-name");
      result.set(pid, cwd);
      descriptor = null;
    } else throw new ObservationProtocolError("invalid-field");
  }
  if (descriptor !== null || !result.size) throw new ObservationProtocolError("missing-cwd");
  return result;
}

export function reconcileProcessInventory(before, after, cwds, excluded = new Set()) {
  const left = new Map([...before].filter(([pid]) => !excluded.has(pid)));
  const right = new Map([...after].filter(([pid]) => !excluded.has(pid)));
  if (left.size !== right.size || [...left].some(([pid, start]) => right.get(pid) !== start)) {
    return { records: [], count: right.size, reasons: ["population-changed"] };
  }
  const records = [];
  let missing = 0;
  for (const [pid, startIdentity] of right) {
    const cwd = cwds.get(pid);
    if (cwd === undefined) missing++;
    else records.push({ pid, startIdentity, cwd });
  }
  return { records, count: right.size, reasons: missing ? ["incomplete-coverage"] : [], missing };
}

export function parseWindowsObservation(bytes) {
  let data;
  try { data = JSON.parse(decode(bytes)); }
  catch { throw new ObservationProtocolError("invalid-observation"); }
  if (data?.version !== 1 || typeof data.profile !== "string" || !Array.isArray(data.records)
    || !Number.isSafeInteger(data.unreadableCount) || data.unreadableCount < 0
    || !Number.isSafeInteger(data.changedCount) || data.changedCount < 0
    || !Number.isSafeInteger(data.expectedCount) || data.expectedCount < 0
    || !Number.isSafeInteger(data.afterCount) || data.afterCount < 0
    || typeof data.supported !== "boolean" || typeof data.principal !== "string") throw new ObservationProtocolError("invalid-observation");
  if (data.supported && (data.profile !== "windows-20348-core7-current-sid-x64-v1"
    || !/^S-\d+(?:-\d+){2,}$/.test(data.principal) || data.expectedCount === 0)) throw new ObservationProtocolError("invalid-observation");
  const diagnostics = {};
  if (data.failures !== undefined) {
    if (!data.failures || typeof data.failures !== "object" || Array.isArray(data.failures)) throw new ObservationProtocolError("invalid-diagnostics");
    for (const [code, count] of Object.entries(data.failures)) {
      if (!/^(owner|cwd)-[a-z0-9-]{1,70}$/.test(code) || !Number.isSafeInteger(count) || count < 1) throw new ObservationProtocolError("invalid-diagnostics");
      diagnostics[code] = count;
    }
  }
  const ids = new Set();
  for (const row of data.records) {
    if (!Number.isSafeInteger(row.pid) || row.pid <= 0 || ids.has(row.pid)
      || typeof row.startIdentity !== "string" || !row.startIdentity
      || typeof row.cwd !== "string" || !path.win32.isAbsolute(row.cwd) || row.cwd.includes("\0")) {
      throw new ObservationProtocolError("invalid-observation");
    }
    ids.add(row.pid);
  }
  return {
    records: data.records, count: data.records.length, profile: data.profile,
    reasons: !data.supported ? ["unsupported-profile"] : data.unreadableCount || data.records.length !== data.expectedCount ? ["incomplete-coverage"]
      : data.changedCount || data.expectedCount !== data.afterCount ? ["population-changed"] : [],
    missing: data.unreadableCount, diagnostics,
  };
}
