export const STUCK_AFTER = 3;

const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value) => typeof value === "string" && value.length > 0;
const nullableText = (value) => value === null || typeof value === "string";
const protocolError = () => ({ ok: false, error: { code: "protocol-error" } });

// A trailing notification must never replace the response to our own request.
export function parseToolResponse(contentType, body, requestId) {
  try {
    const type = contentType?.split(";")[0].trim().toLowerCase();
    let messages;
    if (type === "application/json") {
      messages = [JSON.parse(body)];
    } else if (type === "text/event-stream") {
      messages = body.replace(/\r\n/g, "\n").split(/\n\n+/).flatMap((event) => {
        const data = event.split("\n").filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).replace(/^ /, ""));
        return data.length === 0 ? [] : [JSON.parse(data.join("\n"))];
      });
    } else return protocolError();

    const matches = [];
    for (const message of messages) {
      if (!object(message) || message.jsonrpc !== "2.0") return protocolError();
      if (!Object.hasOwn(message, "id")) {
        if (!text(message.method)) return protocolError();
        continue;
      }
      if (message.id === requestId) matches.push(message);
    }
    if (matches.length !== 1) return protocolError();
    const message = matches[0];
    if (Object.hasOwn(message, "error") || !object(message.result)) return protocolError();
    const result = message.result;
    if (result.isError !== undefined && typeof result.isError !== "boolean") return protocolError();
    if (!Array.isArray(result.content)) return protocolError();
    const blocks = result.content.filter((block) => object(block) && block.type === "text");
    if (blocks.length !== 1 || typeof blocks[0].text !== "string") return protocolError();
    const value = JSON.parse(blocks[0].text);
    if (!object(value)) return protocolError();
    if (result.isError === true) {
      return text(value.error) ? { ok: false, error: { code: "access-refused", reason: value.error } } : protocolError();
    }
    return { ok: true, value };
  } catch {
    return protocolError();
  }
}

function requireValue(condition) {
  if (!condition) throw new Error("Invalid pipeline overview.");
}

function validateEntry(entry, slot) {
  requireValue(object(entry) && text(entry.runId) && text(entry.entryId) && text(entry.slotId));
  if (slot !== undefined) requireValue(entry.slotId === slot);
}

function validateFormat(format) {
  requireValue(format === null || format === "slots-v1");
}

function validateItem(item) {
  requireValue(object(item) && text(item.key) && Number.isInteger(item.version) && item.version > 0);
  if (item.action === "done") {
    requireValue(nullableText(item.node));
    return;
  }
  requireValue(text(item.node));
  switch (item.action) {
    case "dispatch":
      requireValue(text(item.agent) && typeof item.hint === "string");
      validateFormat(item.format);
      if (item.format === "slots-v1") validateEntry(item.entry, item.node);
      else if (item.entry !== undefined) validateEntry(item.entry);
      break;
    case "accept":
      requireValue(typeof item.hint === "string");
      break;
    case "wait":
      switch (item.on) {
        case "gate":
          requireValue(text(item.gate) && nullableText(item.planCommit));
          requireValue(item.boundary === null || (object(item.boundary)
            && text(item.boundary.from) && text(item.boundary.to)));
          validateFormat(item.format);
          if (item.gateEntry !== undefined) requireValue(object(item.gateEntry)
            && text(item.gateEntry.runId) && text(item.gateEntry.entryId));
          break;
        case "acceptance":
          requireValue(item.node === "accept" && Array.isArray(item.checks) && item.checks.length >= 1 && item.checks.length <= 5
            && item.checks.every((check) => Number.isInteger(check) && check >= 1 && check <= 5)
            && new Set(item.checks).size === item.checks.length && typeof item.note === "string"
            && item.note.trim().length > 0 && item.note.length <= 150);
          break;
        case "handoff": requireValue(nullableText(item.note)); break;
        case "cap": requireValue(typeof item.reason === "string"); break;
        default: requireValue(false);
      }
      break;
    default: requireValue(false);
  }
}

export function actionableWork(overview, policy) {
  requireValue(object(overview) && object(overview.head) && Array.isArray(overview.items));
  requireValue(object(policy) && typeof policy.propose === "boolean" && typeof policy.commit === "boolean");
  const head = overview.head;
  if (head.action === "dispatch") requireValue((head.agent === "pm" || head.agent === "feature-scout")
    && typeof head.hint === "string");
  else requireValue(head.action === "none" && typeof head.reason === "string");
  if (overview.runbook !== undefined) requireValue(object(overview.runbook)
    && overview.runbook.stale === true && typeof overview.runbook.note === "string");
  const keys = new Set();
  const items = [];
  for (const item of overview.items) {
    validateItem(item);
    requireValue(!keys.has(item.key));
    keys.add(item.key);
    if (item.action === "dispatch" || item.action === "accept") items.push({
      key: item.key, node: item.node, version: item.version, action: item.action,
      agent: item.action === "dispatch" ? item.agent : null,
      format: item.action === "dispatch" ? item.format : null,
      entry: item.action === "dispatch" && item.entry ? {
        runId: item.entry.runId, entryId: item.entry.entryId, slotId: item.entry.slotId,
      } : null,
    });
  }
  return {
    items, head: policy.propose && head.action === "dispatch" ? { agent: head.agent } : null,
    runbookStale: overview.runbook?.stale === true,
  };
}

export function hasWork(work) {
  return work.items.length > 0 || work.head !== null;
}

export function workSignature(work) {
  if (!hasWork(work)) return null;
  const tuples = work.items.map((item) => [item.key, item.node, item.version, item.action, item.agent,
    item.format, item.entry?.runId ?? null, item.entry?.entryId ?? null, item.entry?.slotId ?? null]);
  tuples.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return JSON.stringify([tuples, work.head?.agent ?? null]);
}

export function nextWatchState(state, signature) {
  if (!signature) return { lastSignature: null, repeats: 0, stuck: false };
  const repeats = state.lastSignature === signature ? state.repeats + 1 : 1;
  return { lastSignature: signature, repeats, stuck: repeats >= STUCK_AFTER };
}
