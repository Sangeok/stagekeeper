import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Client generation needs no database. DB commands still require a valid URL.
  datasource: { url: process.env.DATABASE_URL ?? "" },
});
