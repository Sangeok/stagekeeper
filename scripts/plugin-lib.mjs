import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CORE = "packages/core";
const LIB = "plugin/lib";

// 배포 대상은 core의 모듈만이다 — 테스트는 저장소에서만 돈다. 검사와 동기화가 이 한 줄을 공유한다.
const isDeliverable = (name) => name.endsWith(".mjs") && !name.endsWith(".test.mjs");

function listModules(directory) {
  return readdirSync(directory).filter(isDeliverable).sort();
}

// drift = 복사본이 없거나 내용이 다른 원본. orphan = 원본이 사라진 복사본.
// 원본 디렉터리가 없으면 던진다 — 잘못된 cwd에서 "원본 0개"로 읽혀 복사본을 전부 지우는 일을 막는다(Before의 ENOENT와 같은 실패 방식).
export function diffPluginLib(projectRoot = process.cwd()) {
  const core = resolve(projectRoot, CORE);
  const lib = resolve(projectRoot, LIB);
  if (!existsSync(core)) throw new Error(`${CORE} not found under ${projectRoot} — run from the repository root`);
  const coreModules = listModules(core);
  const drift = coreModules.filter((name) => {
    const copy = join(lib, name);
    return !existsSync(copy) || readFileSync(copy, "utf8") !== readFileSync(join(core, name), "utf8");
  });
  const orphan = (existsSync(lib) ? listModules(lib) : []).filter((name) => !coreModules.includes(name));
  return { drift, orphan };
}

// 복사본을 원본과 같게 만든다 — 다른 것은 덮어쓰고 원본이 없는 것은 지운다.
export function syncPluginLib(projectRoot = process.cwd()) {
  const { drift, orphan } = diffPluginLib(projectRoot);
  mkdirSync(resolve(projectRoot, LIB), { recursive: true });
  for (const name of drift) copyFileSync(resolve(projectRoot, CORE, name), resolve(projectRoot, LIB, name));
  for (const name of orphan) rmSync(resolve(projectRoot, LIB, name));
  return { drift, orphan };
}

function runCli() {
  if (process.argv.includes("--check")) {
    const { drift, orphan } = diffPluginLib();
    for (const name of drift) console.log(`drift: ${LIB}/${name}`);
    for (const name of orphan) console.log(`orphan: ${LIB}/${name}`);
    if (drift.length || orphan.length) { console.log("run: npm run sync:plugin-lib"); process.exit(1); }
    console.log("plugin/lib in sync");
    return;
  }
  const { drift, orphan } = syncPluginLib();
  console.log(`plugin/lib synced (${drift.length} copied, ${orphan.length} removed)`);
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === currentFile) runCli();
