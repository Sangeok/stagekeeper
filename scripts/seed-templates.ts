// 로컬 템플릿 원본을 DB로 올린다. 원본은 공개 저장소에 없으므로(.gitignore) 이 스크립트는 손으로 돌린다.
// 사용: npm run seed:templates [-- --dir plugin/templates]
// top-level await을 쓰지 않는다 — package.json에 type:module이 없어 tsx가 CJS로 변환한다.
import "dotenv/config";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const args = process.argv.slice(2);
const opt = (n: string, d: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const DIR = opt("--dir", "plugin/templates");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  let total = 0;
  try {
    for (const lang of readdirSync(DIR).filter((n) => statSync(join(DIR, n)).isDirectory())) {
      const root = join(DIR, lang);
      for (const file of walk(root)) {
        // 키는 언어를 뺀 상대 경로 — 언어는 쿼리 파라미터로 갈린다. 구분자는 URL 형태로 통일한다.
        const path = relative(root, file).split(sep).join("/");
        const body = readFileSync(file, "utf8");
        await prisma.template.upsert({
          where: { lang_path: { lang, path } },
          create: { lang, path, body },
          update: { body },
        });
        console.log(`seed: ${lang}/${path}`);
        total += 1;
      }
    }
  } finally {
    await prisma.$disconnect();
  }
  console.log(`done: ${total} templates`);
}

main().catch((e) => { console.error(e); process.exit(1); });
