import assert from "node:assert/strict";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { it } from "node:test";
import { sealTranscripts } from "./pipeline-smoke-steps.mjs";
import { openInspection, rewrapTranscripts } from "./rewrap-pipeline-transcripts.mjs";

it("rewraps transcripts for one recipient without exporting the source key and rejects tampering", () => {
  const keys = () => generateKeyPairSync("rsa", { modulusLength: 3072, publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });
  const recipient = keys(), other = keys(), sourceKey = randomBytes(32);
  const files = { "session.jsonl": "Private fixture text" };
  const envelope = rewrapTranscripts(sealTranscripts(files, sourceKey), sourceKey, recipient.publicKey);
  assert.deepEqual(openInspection(envelope, recipient.privateKey), files);
  assert.ok(!JSON.stringify(envelope).includes(sourceKey.toString("base64")));
  assert.ok(!JSON.stringify(envelope).includes(files["session.jsonl"]));
  assert.throws(() => openInspection(envelope, other.privateKey));
  const corrupted = Buffer.from(envelope.sealed, "base64"); corrupted[corrupted.length - 1] ^= 1;
  assert.throws(() => openInspection({ ...envelope, sealed: corrupted.toString("base64") }, recipient.privateKey));
});
