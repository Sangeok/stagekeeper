import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, fstatSync, lstatSync, mkdirSync, openSync, opendirSync, readSync, realpathSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

const MAX_FILE_BYTES = 1024 * 1024;
const MAX_SCAN_FILES = 1000;
const MAX_SCAN_BYTES = 16 * MAX_FILE_BYTES;
const READ_TOOLS = ["role_file_read", "role_file_list", "role_file_search"];
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
// Windows lstat's fast path reports dev=0; fstat reports the volume serial.
// resolveTarget pins the drive and physical path, so compare its file ID here.
const identity = stat => process.platform === "win32" ? String(stat.ino) : `${stat.dev}:${stat.ino}`;
const canonical = name => process.platform === "win32" ? name.toLowerCase() : name;

export class RoleFileInputError extends Error {
  constructor() { super("Invalid read pagination. Use integer maxLines 1..500 and positive safe-integer startLine; follow nextLine for further pages. Correct parameters without changing target permissions."); this.name = "RoleFileInputError"; }
}

export function roleFileToolNames(agent) {
  if (agent === "pm") return [];
  // Read-only roles may write scratch; the path policy still refuses repository writes.
  return [...READ_TOOLS, "role_file_write"];
}

const schemas = {
  role_file_read: { description: "Read a permitted UTF-8 file, with line pagination and a SHA-256 for guarded editing. Absolute paths only. maxLines is 1..500 (default 200); follow nextLine to continue reading the complete file.", properties: { path: { type: "string" }, startLine: { type: "integer", minimum: 1 }, maxLines: { type: "integer", minimum: 1, maximum: 500 } }, required: ["path"] },
  role_file_list: { description: "List up to 200 permitted directory entries. A denied workspace is omitted. Use the nextOffset to continue.", properties: { path: { type: "string" }, offset: { type: "integer", minimum: 0 } }, required: ["path"] },
  role_file_search: { description: "Search a literal string in permitted UTF-8 files in a directory. Reports incomplete scans explicitly; never interprets a regex or shell command.", properties: { path: { type: "string" }, text: { type: "string", minLength: 1, maxLength: 200 }, offset: { type: "integer", minimum: 0 } }, required: ["path", "text"] },
  role_file_write: { description: "Write a permitted UTF-8 file. expectedHash must be the SHA-256 from a current read, or null for a new file. Managed and Git files remain protected, including absent paths.", properties: { path: { type: "string" }, content: { type: "string" }, expectedHash: { type: ["string", "null"] } }, required: ["path", "content", "expectedHash"] },
};

export function roleFileTools(agent) {
  return roleFileToolNames(agent).map(name => {
    const { description, properties, required } = schemas[name];
    return { name, description, inputSchema: { type: "object", properties, required, additionalProperties: false } };
  });
}

// The Windows backend exposes data operations, not a general process launcher.
// Neither model-provided code nor a shell runs in this privileged broker.
export function createRoleFiles(filesystem, agent) {
  if (filesystem[":root"] !== "deny") throw new Error("Role file broker requires root denial");
  const rules = Object.entries(filesystem).filter(([name]) => !name.startsWith(":"))
    .map(([name, access]) => {
      if (!path.isAbsolute(name) || !["deny", "read", "write"].includes(access)) throw new Error("Invalid file policy");
      return { name: canonical(path.resolve(name)), access };
    }).sort((a, b) => b.name.length - a.name.length);
  const names = roleFileToolNames(agent);
  let closed = false;

  function access(target) {
    const name = canonical(target);
    return rules.find(rule => name === rule.name || name.startsWith(rule.name.endsWith(path.sep) ? rule.name : rule.name + path.sep))?.access ?? "deny";
  }

  function resolveTarget(name, write = false) {
    if (typeof name !== "string" || name.length > 4096 || !path.isAbsolute(name) || /[\x00-\x1f]/.test(name)) throw new Error("Absolute file path required");
    const target = path.resolve(name), parsed = path.parse(target);
    if (process.platform === "win32") {
      if (!/^[A-Za-z]:\\$/.test(parsed.root) || name.startsWith("\\\\")) throw new Error("Device and network paths refused");
      for (const part of name.slice(parsed.root.length).split(/[\\/]/)) {
        if (part === "." || part === ".." || /[<>:"|?*]/.test(part) || /[. ]$/.test(part)
          || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)) throw new Error("Ambiguous Windows path refused");
      }
    }
    if (access(target) === "deny" || (write && access(target) !== "write")) throw new Error("File permission refused");
    let current = parsed.root;
    for (const segment of target.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
      current = path.join(current, segment);
      try {
        const stat = lstatSync(current, { bigint: true });
        if (stat.isSymbolicLink() || canonical(realpathSync(current)) !== canonical(current)) throw new Error("File alias refused");
        if (stat.isFile() && stat.nlink !== 1n) throw new Error("Hard-linked file refused");
      } catch (error) { if (error.code !== "ENOENT") throw error; }
    }
    return target;
  }

  function read(target) {
    resolveTarget(target);
    const before = lstatSync(target, { bigint: true });
    if (!before.isFile() || before.size > BigInt(MAX_FILE_BYTES)) throw new Error("Text file too large or unsupported");
    const descriptor = openSync(target, "r");
    try {
      if (identity(fstatSync(descriptor, { bigint: true })) !== identity(before)) throw new Error("File changed while opening");
      const buffer = Buffer.alloc(MAX_FILE_BYTES + 1); let length = 0, count;
      while (length < buffer.length && (count = readSync(descriptor, buffer, length, buffer.length - length, null)) > 0) length += count;
      const bytes = buffer.subarray(0, length);
      resolveTarget(target);
      const after = lstatSync(target, { bigint: true });
      if (bytes.length > MAX_FILE_BYTES || identity(after) !== identity(before) || after.mtimeNs !== before.mtimeNs || after.size !== before.size) throw new Error("File changed while reading");
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (text.includes("\0")) throw new Error("Binary file refused");
      return { text, hash: digest(bytes), bytes: bytes.length, identity: identity(after) };
    } finally { closeSync(descriptor); }
  }

  function entries(target, deadline = Date.now() + 5000) {
    resolveTarget(target);
    if (!lstatSync(target).isDirectory()) throw new Error("Directory required");
    const directory = opendirSync(target), found = []; let incomplete = false, skipped = 0;
    try {
      let entry;
      while ((entry = directory.readSync())) {
        found.push(entry.name);
        if (found.length > 10000) throw new Error("Directory too large");
        if (Date.now() > deadline) { incomplete = true; break; }
      }
    } finally { directory.closeSync(); }
    found.sort();
    const items = [];
    for (const name of found) {
      if (Date.now() > deadline) { incomplete = true; break; }
      const child = path.join(target, name);
      if (access(child) === "deny") continue;
      try {
        resolveTarget(child);
        const stat = lstatSync(child);
        if (!stat.isDirectory() && !stat.isFile()) { skipped++; continue; }
        items.push({ path: child, type: stat.isDirectory() ? "directory" : "file" });
      } catch { skipped++; }
    }
    return { items, skipped, incomplete };
  }

  function write(target, args) {
    resolveTarget(target, true);
    if (typeof args.content !== "string" || Buffer.byteLength(args.content, "utf8") > MAX_FILE_BYTES || args.content.includes("\0")
      || (args.expectedHash !== null && !/^[a-f0-9]{64}$/.test(args.expectedHash ?? ""))) throw new Error("Invalid guarded text write");
    const previous = existsSync(target) ? read(target) : null;
    if ((previous?.hash ?? null) !== args.expectedHash) throw new Error("File revision differs; read it again");
    mkdirSync(path.dirname(target), { recursive: true });
    resolveTarget(target, true);
    const temporary = path.join(path.dirname(target), `.harness-role-${randomUUID()}.tmp`);
    const descriptor = openSync(temporary, "wx", 0o600);
    let renamed = false, open = true;
    const own = identity(fstatSync(descriptor, { bigint: true }));
    try {
      writeFileSync(descriptor, args.content, "utf8");
      closeSync(descriptor); open = false;
      resolveTarget(target, true);
      const current = existsSync(target) ? read(target) : null;
      if ((current?.hash ?? null) !== args.expectedHash || (current?.identity ?? null) !== (previous?.identity ?? null)) throw new Error("File revision changed during write");
      if (identity(lstatSync(temporary, { bigint: true })) !== own) throw new Error("Temporary file ownership changed");
      renameSync(temporary, target); renamed = true;
      return { path: target, hash: digest(Buffer.from(args.content, "utf8")), bytes: Buffer.byteLength(args.content, "utf8") };
    } finally {
      if (open) closeSync(descriptor);
      if (!renamed && existsSync(temporary) && identity(lstatSync(temporary, { bigint: true })) === own) unlinkSync(temporary);
    }
  }

  return {
    tools: roleFileTools(agent),
    // Trusted snapshot exporter only; these methods are never MCP tools.
    permission: access,
    resolveRead(name) { if (closed) throw new Error("Role file broker closed"); return resolveTarget(name); },
    close() { closed = true; },
    call(name, args) {
      if (closed || !names.includes(name) || !args || Array.isArray(args) || typeof args !== "object") throw new Error("Role file operation unavailable");
      const schema = schemas[name];
      if (Object.keys(args).some(key => !Object.hasOwn(schema.properties, key)) || schema.required.some(key => !Object.hasOwn(args, key))) throw new Error("Unexpected file arguments");
      const target = resolveTarget(args.path, name === "role_file_write");
      if (name === "role_file_write") return write(target, args);
      if (name === "role_file_read") {
        const start = args.startLine ?? 1, count = args.maxLines ?? 200;
        if (!Number.isSafeInteger(start) || start < 1 || !Number.isInteger(count) || count < 1 || count > 500) throw new RoleFileInputError();
        const file = read(target), lines = file.text.split(/\r?\n/), selected = lines.slice(start - 1, start - 1 + count).join("\n");
        if (Buffer.byteLength(selected, "utf8") > 65536) throw new Error("Read page too large");
        return { path: target, hash: file.hash, text: selected, startLine: start, totalLines: lines.length, nextLine: start - 1 + count < lines.length ? start + count : null };
      }
      const offset = args.offset ?? 0;
      if (!Number.isSafeInteger(offset) || offset < 0) throw new Error("Invalid scan pagination");
      if (name === "role_file_list") {
        const found = entries(target);
        return { entries: found.items.slice(offset, offset + 200), skipped: found.skipped, incomplete: found.incomplete || found.skipped > 0,
          nextOffset: !found.incomplete && offset + 200 < found.items.length ? offset + 200 : null };
      }
      if (typeof args.text !== "string" || !args.text || args.text.length > 200) throw new Error("Literal search text required");
      const matches = []; let files = 0, bytes = 0, skipped = 0, directories = 0, visited = 0, incomplete = false, truncatedFile = null;
      const deadline = Date.now() + 5000;
      function visit(directory) {
        if (++directories > 2000 || Date.now() > deadline) { incomplete = true; return; }
        const listing = entries(directory, deadline); skipped += listing.skipped;
        if (listing.incomplete) incomplete = true;
        for (const entry of listing.items) {
          if (Date.now() > deadline) { incomplete = true; break; }
          if (files >= MAX_SCAN_FILES || bytes >= MAX_SCAN_BYTES || matches.length >= 200) { incomplete = true; break; }
          if (entry.type === "directory") { visit(entry.path); if (incomplete) break; continue; }
          if (visited++ < offset) continue;
          files++;
          let file;
          try { file = read(entry.path); } catch { skipped++; continue; }
          bytes += file.bytes;
          const lines = file.text.split(/\r?\n/);
          for (let index = 0; index < lines.length; index++) {
            if (lines[index].includes(args.text)) matches.push({ path: entry.path, line: index + 1, text: lines[index].slice(0, 500) });
            if (matches.length >= 200) { incomplete = true; truncatedFile = entry.path; break; }
          }
        }
      }
      visit(target);
      return { matches, files, skipped, incomplete: incomplete || skipped > 0, truncatedFile, nextOffset: incomplete && files ? offset + files : null };
    },
  };
}
