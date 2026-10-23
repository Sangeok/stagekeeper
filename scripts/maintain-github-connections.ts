import "dotenv/config";
import { maintainGitHubConnections } from "../src/server/github/api.server";
import { prisma } from "../src/server/db";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (!args.includes("--apply") || args.some(arg => arg !== "--apply" && arg !== "--rotate")) throw new Error("Use --apply with optional --rotate");
  if (!process.env.DATABASE_URL) throw new Error("Database configuration required");
  console.log(JSON.stringify(await maintainGitHubConnections(args.includes("--rotate"))));
}

main().catch(() => { console.error("GitHub repository maintenance failed. Check database and vault configuration."); process.exitCode = 1; }).finally(() => prisma.$disconnect());
