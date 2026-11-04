export const STUCK_AFTER = 3;

const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value) => typeof value === "string" && value.length > 0;
const nullableText = (value) => value === null || typeof value === "string";
const protocolError = () => ({ ok: false, error: { code: "protocol-error" } });

export function parseToolResponse(contentType, body, requestId, valueKind = "object") {
  try {
    if (!["object", "object-list"].includes(valueKind)) return protocolError();
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
    if (result.isError === true) {
      if (!object(value) || !text(value.error) || (value.code !== undefined && typeof value.code !== "string")) return protocolError();
      const error = { code: "access-refused", reason: value.error };
      if (value.code === "USAGE_LIMIT_REACHED") {
        if (typeof value.resetAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value.resetAt)
          || !Number.isFinite(Date.parse(value.resetAt))) return protocolError();
        return { ok: false, error: { ...error, domainCode: value.code, resetAt: value.resetAt } };
      }
      if (value.code === "RATE_LIMITED") {
        if (!Number.isSafeInteger(value.retryAfterSec) || value.retryAfterSec < 1) return protocolError();
        return { ok: false, error: { ...error, domainCode: value.code, retryAfterSec: value.retryAfterSec } };
      }
      return { ok: false, error };
    }
    if (valueKind === "object" ? !object(value) : !Array.isArray(value) || !value.every(object)) return protocolError();
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

function validateTemplateMetadata(value) {
  requireValue(object(value) && text(value.id) && value.schemaVersion === 1 && value.protocol === "template-release-v1"
    && text(value.language) && typeof value.clientSurfaceHash === "string" && /^[a-f0-9]{64}$/.test(value.clientSurfaceHash));
}

function validateExecution(value, node) {
  requireValue(object(value) && (value.kind === "standalone" || (value.kind === "legacy" && text(value.runId) && text(value.node))));
  if (node !== undefined && value.kind === "legacy") requireValue(value.node === node);
}

function validateItem(item) {
  requireValue(object(item) && text(item.key));
  if (item.templateRelease !== undefined) validateTemplateMetadata(item.templateRelease);
  if (item.templateProtocol !== undefined) { requireValue(item.templateProtocol === "template-release-v1"); validateTemplateMetadata(item.templateRelease); }
  requireValue(!(item.entry !== undefined && item.execution !== undefined));
  if (item.execution !== undefined) validateExecution(item.execution, item.node);
  if (item.action === "wait" && item.on === "template") {
    requireValue(nullableText(item.node) && (item.version === null || (Number.isInteger(item.version) && item.version > 0)) && text(item.reason));
    validateTemplateMetadata(item.templateRelease);
    return;
  }
  requireValue(Number.isInteger(item.version) && item.version > 0);
  if (item.action === "done") {
    requireValue(nullableText(item.node));
    return;
  }
  requireValue(text(item.node));
  switch (item.action) {
    case "dispatch":
      requireValue(text(item.agent) && typeof item.hint === "string");
      validateFormat(item.format);
      if (item.templateRelease && item.format === null) requireValue(item.execution?.kind === "legacy");
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
        case "qa":
          requireValue(item.node === "qa" && text(item.note) && text(item.path) && /^[0-9a-f]{7,40}$/.test(item.commit)
            && object(item.resume) && item.resume.agent === "qa-verifier" && item.resume.key === item.key && item.resume.format === "slots-v1");
          validateEntry(item.resume.entry, "qa");
          break;
        case "impl-verify":
          requireValue(item.node === "impl-verify" && text(item.note) && text(item.path) && /^[0-9a-f]{7,40}$/.test(item.commit)
            && object(item.resume) && item.resume.agent === "impl-verifier" && item.resume.key === item.key && item.resume.format === "slots-v1");
          validateEntry(item.resume.entry, "impl-verify");
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
  if (head.templateRelease !== undefined) validateTemplateMetadata(head.templateRelease);
  if (head.templateProtocol !== undefined) { requireValue(head.templateProtocol === "template-release-v1"); validateTemplateMetadata(head.templateRelease); }
  requireValue(!(head.entry !== undefined && head.execution !== undefined));
  if (head.execution !== undefined) validateExecution(head.execution);
  if (head.action === "dispatch") requireValue(["pm", "feature-scout", "work-assigner", "work-discoverer", "doc-auditor"].includes(head.agent)
    && typeof head.hint === "string");
  else requireValue(head.action === "none" && typeof head.reason === "string");
  if (head.entry !== undefined) validateEntry(head.entry);
  if (head.action === "dispatch" && ["work-assigner", "work-discoverer", "doc-auditor"].includes(head.agent)) validateEntry(head.entry);
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
      ...(item.execution ? { execution: item.execution } : {}),
      ...(item.templateRelease ? { templateRelease: item.templateRelease } : {}),
      entry: item.action === "dispatch" && item.entry ? {
        runId: item.entry.runId, entryId: item.entry.entryId, slotId: item.entry.slotId,
      } : null,
    });
  }
  return {
    items, head: policy.propose && head.action === "dispatch" ? { agent: head.agent, ...(head.entry ? { entry: head.entry } : {}), ...(head.execution ? { execution: head.execution } : {}), ...(head.templateRelease ? { templateRelease: head.templateRelease } : {}) } : null,
    runbookStale: overview.runbook?.stale === true,
  };
}

export function hasWork(work) {
  return work.items.length > 0 || work.head !== null;
}

export function workSignature(work) {
  if (!hasWork(work)) return null;
  const tuples = work.items.map((item) => [item.key, item.node, item.version, item.action, item.agent,
    item.format, item.entry?.runId ?? null, item.entry?.entryId ?? null, item.entry?.slotId ?? null, executionSignature(item.execution), templateSignature(item.templateRelease)]);
  tuples.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return JSON.stringify([tuples, work.head?.agent ?? null, work.head?.entry ? [work.head.entry.runId, work.head.entry.entryId, work.head.entry.slotId] : null, executionSignature(work.head?.execution), templateSignature(work.head?.templateRelease)]);
}

export function nextWatchState(state, signature) {
  if (!signature) return { lastSignature: null, repeats: 0, stuck: false };
  const repeats = state.lastSignature === signature ? state.repeats + 1 : 1;
  return { lastSignature: signature, repeats, stuck: repeats >= STUCK_AFTER };
}

function executionSignature(value) {
  return value ? [value.kind, value.runId ?? null, value.node ?? null] : null;
}

function templateSignature(value) {
  return value ? [value.id, value.schemaVersion, value.protocol, value.language, value.clientSurfaceHash] : null;
}
