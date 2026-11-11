import { readFileSync } from "node:fs";
import { release } from "node:os";
import { join } from "node:path";

const CLIENTS = ["claude", "codex"];
const VERSION = /^\d+\.\d+\.\d+$/;
const OS_VERSION = /^\d+(?:\.\d+){1,3}$/;

export function environmentFields(record) {
  const fields = {};
  if (CLIENTS.includes(record?.client)) fields.client = record.client;
  for (const name of ["clientVersion", "pluginVersion"]) if (typeof record?.[name] === "string" && VERSION.test(record[name])) fields[name] = record[name];
  if (typeof record?.osVersion === "string" && OS_VERSION.test(record.osVersion)) fields.osVersion = record.osVersion;
  return fields;
}

export function clientVersion(output) {
  const first = typeof output === "string" ? output.trim().split(/\s+/)[0] : "";
  return VERSION.test(first) ? first : undefined;
}

export function osVersion(platform, read) {
  let value;
  try {
    value = platform === "darwin" ? read.product() : read.release();
  } catch {
    return undefined;
  }
  const text = typeof value === "string" ? value.trim() : "";
  return OS_VERSION.test(text) ? text : undefined;
}

export function pluginVersionAt(pluginRoot, read = readFileSync) {
  try {
    const version = JSON.parse(read(join(pluginRoot, ".claude-plugin", "plugin.json"), "utf8")).version;
    return typeof version === "string" && VERSION.test(version) ? version : undefined;
  } catch {
    return undefined;
  }
}

export function measureEnvironment(platform, command) {
  const output = (file, args) => {
    try {
      return command(file, args);
    } catch {
      return "";
    }
  };
  return {
    clientVersion: clientVersion(output("claude", ["--version"])),
    osVersion: osVersion(platform, { product: () => command("sw_vers", ["-productVersion"]), release }),
  };
}
