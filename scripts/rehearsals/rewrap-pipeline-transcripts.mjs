import { createHash, createPublicKey, privateDecrypt, publicEncrypt, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { openTranscripts, sealTranscripts, transcriptKey } from "./pipeline-smoke-steps.mjs";

const SOURCE_RUN = 41760230941;
export const recipientFingerprint = key => createHash("sha256").update(createPublicKey(key).export({ type: "spki", format: "der" })).digest("hex");

export function rewrapTranscripts(sealed, sourceKey, publicKey) {
  const files = openTranscripts(sealed, sourceKey);
  const inspectionKey = randomBytes(32);
  try {
    return { version: 1, sourceRunId: SOURCE_RUN, sourceHash: createHash("sha256").update(sealed).digest("hex"),
      recipient: recipientFingerprint(publicKey), wrappedKey: publicEncrypt({ key: publicKey, oaepHash: "sha256" }, inspectionKey).toString("base64"),
      sealed: sealTranscripts(files, inspectionKey).toString("base64") };
  } finally { inspectionKey.fill(0); }
}

export function openInspection(envelope, privateKey) {
  if (envelope.version !== 1 || envelope.sourceRunId !== SOURCE_RUN || envelope.recipient !== recipientFingerprint(privateKey)) throw new Error("Unexpected inspection recipient or run");
  const key = privateDecrypt({ key: privateKey, oaepHash: "sha256" }, Buffer.from(envelope.wrappedKey, "base64"));
  try { return openTranscripts(Buffer.from(envelope.sealed, "base64"), key); }
  finally { key.fill(0); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let key;
  try {
    if (process.argv.length !== 4) throw new Error("Expected input and output");
    key = transcriptKey(process.env.TRANSCRIPT_KEY); delete process.env.TRANSCRIPT_KEY;
    const publicKey = readFileSync(new URL("./pipeline-transcript-recipient.pem", import.meta.url), "utf8");
    const envelope = rewrapTranscripts(readFileSync(process.argv[2]), key, publicKey);
    writeFileSync(process.argv[3], JSON.stringify(envelope), { flag: "wx", mode: 0o600 });
    console.log(JSON.stringify({ sourceRunId: SOURCE_RUN, recipient: envelope.recipient, encrypted: true }));
  } catch { console.error("Private transcript inspection preparation failed; details withheld."); process.exitCode = 1; }
  finally { key?.fill(0); }
}
