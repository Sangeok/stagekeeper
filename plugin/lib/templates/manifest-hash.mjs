import { createHash } from "node:crypto";

export function deliverySurfaceHash({ templates, language, client, contractHash }) {
  return manifestHash({ client, language, contractHash, templates });
}

export function canonicalJson(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isSafeInteger(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  throw new Error("Unsupported canonical manifest value");
}

export function manifestHash(value) {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}
