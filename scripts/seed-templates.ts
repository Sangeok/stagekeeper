// 로컬 템플릿 원본을 DB로 올린다. 원본은 공개 저장소에 없으므로(.gitignore) 이 스크립트는 손으로 돌린다.
// 사용: npm run seed:templates [-- --dir plugin/templates]
// top-level await을 쓰지 않는다 — package.json에 type:module이 없어 tsx가 CJS로 변환한다.
import "dotenv/config";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { splitTemplate } from "../src/server/agents/steps";

const args = process.argv.slice(2);
const opt = (n: string, d: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const DIR = opt("--dir", "plugin/templates");

// 템플릿은 .md뿐이다. 점으로 시작하는 디렉터리(.git — 원본 디렉터리가 별도 저장소다)는 언어도 템플릿도 아니다.
const isLangDir = (dir: string, name: string) => !name.startsWith(".") && statSync(join(dir, name)).isDirectory();

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name.startsWith(".") ? [] : walk(full);
    return name.endsWith(".md") ? [full] : [];
  });
}

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  let total = 0;
  try {
    for (const lang of readdirSync(DIR).filter((n) => isLangDir(DIR, n))) {
      const root = join(DIR, lang);
      for (const file of walk(root)) {
        // 키는 언어를 뺀 상대 경로 — 언어는 쿼리 파라미터로 갈린다. 구분자는 URL 형태로 통일한다.
        const path = relative(root, file).split(sep).join("/");
        const body = readFileSync(file, "utf8").replace(/\r\n/g, "\n"); // autocrlf 작업본이 CRLF여도 DB에는 LF만
        // 에이전트 템플릿은 저장 전에 한 번 파싱한다 — 형식 오류는 agent_next가 500을 내기 전, 여기서 터져야 한다.
        const steps = path.startsWith("agents/") ? splitTemplate(body).steps.length : null;
        await prisma.template.upsert({
          where: { lang_path: { lang, path } },
          create: { lang, path, body },
          update: { body },
        });
        console.log(`seed: ${lang}/${path}${steps === null ? "" : ` (${steps} steps)`}`);
        total += 1;
      }
    }
  } finally {
    await prisma.$disconnect();
  }
  console.log(`done: ${total} templates`);
}

main().catch((e) => { console.error(e); process.exit(1); });
