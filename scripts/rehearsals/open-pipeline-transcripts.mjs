import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openTranscripts, transcriptKey, writeTranscripts } from "./pipeline-smoke-steps.mjs";

const USAGE = "usage: node scripts/rehearsals/open-pipeline-transcripts.mjs --key-file <key file> --in <sealed file> --out <new directory>";
const OPTIONS = ["--key-file", "--in", "--out"];

export function parseArguments(args) {
  const values = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (!OPTIONS.includes(name)) throw new Error(`unknown option ${name}`);
    if (values.has(name)) throw new Error(`duplicate option ${name}`);
    if (!value || value.startsWith("--")) throw new Error(`missing value for ${name}`);
    values.set(name, value);
  }
  for (const name of OPTIONS) if (!values.has(name)) throw new Error(`missing ${name}`);
  return { keyFile: values.get("--key-file"), input: values.get("--in"), out: path.resolve(values.get("--out")) };
}

export function main(args) {
  let options;
  try {
    options = parseArguments(args);
  } catch (error) {
    console.error(`${error.message}\n${USAGE}`);
    return 2;
  }
  try {
    const files = openTranscripts(readFileSync(options.input), transcriptKey(readFileSync(options.keyFile, "utf8")));
    writeTranscripts(files, options.out);
    console.log(`opened ${Object.keys(files).length} files into ${options.out}`);
    return 0;
  } catch (error) {
    console.error(`could not open the sealed transcripts: ${error.message}`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
