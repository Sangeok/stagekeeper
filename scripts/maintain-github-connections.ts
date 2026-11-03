import "dotenv/config";
import { maintainGitHubConnections } from "../src/server/github/api.server";
import { prisma } from "../src/server/db";

async function main(): Promise<void> {
  try {
    const args = process.argv.slice(2);
    if (!args.includes("--apply") || args.some(arg => arg !== "--apply" && arg !== "--rotate")) {
      console.error("Usage: npm run github:maintenance -- --apply [--rotate]");
      process.exitCode = 1;
      return;
    }
    if (!process.env.DATABASE_URL) {
      console.error("DATABASE_URL is required for GitHub repository maintenance.");
      process.exitCode = 1;
      return;
    }
    console.log(JSON.stringify(await maintainGitHubConnections(args.includes("--rotate"))));
  } catch {
    console.error("GitHub repository maintenance failed. Check database and vault configuration.");
    process.exitCode = 1;
  } finally {
    try {
      await prisma.$disconnect();
    } catch {
      console.error("GitHub repository maintenance database cleanup failed.");
      process.exitCode = 1;
    }
  }
}

main();
